import { mediaErrorKey } from './mediaErrors.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parseExpression } from '@babel/parser'
import { auditCopy, walk } from '../../scripts/localization-audit.mjs'
import { authErrorKey } from './authErrors.js'
import { i18n, localLanguage, normalizeLanguage } from './i18n.js'

test('Tamil switching updates landing, onboarding and both portal namespaces', async () => {
  await i18n.changeLanguage('ta')
  assert.match(i18n.t('landing:log_in'), /[\u0b80-\u0bff]/u)
  assert.match(i18n.t('onboarding:step_step_of_5', { step: 3 }), /3/u)
  assert.notEqual(i18n.t('mother:dashboard'), 'Dashboard')
  assert.notEqual(i18n.t('admin:overview'), 'Overview')

  i18n.addResource('en', 'common', 'fallbackTest', 'English fallback')
  assert.equal(i18n.t('fallbackTest'), 'English fallback')
  await i18n.changeLanguage('en')
  assert.equal(i18n.t('landing:log_in'), 'Log In')
})

test('persisted locale accepts only English or Tamil and tolerates inaccessible storage', () => {
  assert.equal(normalizeLanguage('ta'), 'ta')
  assert.equal(normalizeLanguage('fr'), 'en')
  assert.equal(localLanguage({ getItem: () => 'ta' }), 'ta')
  assert.equal(localLanguage({ getItem() { throw Error('blocked') } }), 'en')
})

test('English and Tamil resources have matching keys across all namespaces', () => {
  for (const namespace of i18n.options.ns) {
    const en = i18n.getResourceBundle('en', namespace)
    const ta = i18n.getResourceBundle('ta', namespace)
    function checkPair(english, tamil, reference) {
      if (typeof english === 'string') {
        assert.equal(typeof tamil, 'string', reference)
        assert.ok(english.trim() && tamil.trim(), reference)
        const placeholders = (text) => [...text.matchAll(/\{\{\s*(.*?)\s*\}\}/g)]
          .map((match) => match[1]).sort()
        assert.deepEqual(placeholders(english), placeholders(tamil), reference)
        return
      }
      assert.ok(english && tamil && typeof tamil === 'object', reference)
      assert.equal(Array.isArray(english), Array.isArray(tamil), reference)
      const keys = Object.keys(english).filter(key => key !== 'fallbackTest').sort()
      assert.deepEqual(keys, Object.keys(tamil).sort(), reference)
      for (const key of keys) checkPair(english[key], tamil[key], reference + '.' + key)
    }
    checkPair(en, ta, namespace)
  }
})

test('shared UI copy references exist', () => {
  const src = fileURLToPath(new URL('../', import.meta.url))
  for (const path of readdirSync(src, { recursive: true })) {
    if (!path.endsWith('.jsx') || path.includes('.backup-')) continue
    const code = readFileSync(join(src, path), 'utf8')
    for (const [, key] of code.matchAll(/\buiText\('([a-z0-9_]+)'/g)) {
      assert.ok(i18n.exists('common:' + key, { lng: 'ta' }), path + ': ' + key)
    }
    for (const [, namespace, key] of code.matchAll(/\b(?:t|uiText|articleUi|localizeCopy|auditText)\(['"](common|landing|auth|onboarding|mother|admin):([a-z0-9_.]+)['"]/g)) {
      assert.ok(i18n.getResource('ta', namespace, key) !== undefined, path + ': ' + namespace + ':' + key)
    }
  }
})

test('authentication errors map known failures and hide unknown server diagnostics', () => {
  assert.equal(authErrorKey('Incorrect email or password.', 401), 'invalid_credentials')
  assert.equal(authErrorKey('SQL details', 500), 'something_went_wrong_please_try_again')
  assert.equal(authErrorKey('', 422), 'invalid_input')
})

test('Wellbeing and billing copy resolves through the shared locale', async () => {
  await i18n.changeLanguage('ta')
  assert.match(i18n.t('mother:wellbeing.title'), /[\u0b80-\u0bff]/u)
  assert.match(i18n.t('mother:billing.title'), /[\u0b80-\u0bff]/u)
  assert.match(i18n.t('mother:entitlement.loading'), /[\u0b80-\u0bff]/u)
  assert.ok(Array.isArray(i18n.t('mother:wellbeing', { returnObjects: true }).questions))
  await i18n.changeLanguage('en')
})

test('locale JSON contains no duplicate property keys before parsing', () => {
  const locales = fileURLToPath(new URL('./', import.meta.url))
  for (const file of readdirSync(locales).filter(path => path.endsWith('.json'))) {
    const raw = readFileSync(join(locales, file), 'utf8')
    JSON.parse(raw)
    walk(parseExpression(raw), [], (node) => {
      if (node.type !== 'ObjectExpression') return
      const keys = node.properties.map(property => property.key.value)
      assert.equal(new Set(keys).size, keys.length, file + ': duplicate key at line ' + node.loc.start.line)
    })
  }
})

test('resolved high-visibility labels cannot regress to hardcoded UI strings', () => {
  const watched = new Map([
    ['App.jsx', ['Unable to load your profile', 'Return to Home']],
    ['components/admin/OverviewDashboard.jsx', ['YOUR MANAGEMENT SPACE']],
    ['components/admin/UsersManager.jsx', ['Send password reset', 'Resend verification']],
    ['components/dashboard/DashboardTodo.jsx', ['No tasks yet. Add your first gentle reminder.']],
  ])
  for (const finding of auditCopy()) {
    const labels = watched.get(finding.file.replace('frontend/src/', ''))
    assert.ok(!labels?.includes(finding.text), finding.file + ':' + finding.line + ' ' + finding.text)
  }
})

test('known media API details resolve to translated UI messages', () => {
  for (const detail of ['Unsupported file type.', 'File exceeds allowed size.', 'Invalid file content.',
    'Media file not found.', 'Stored file not found.', 'Media file is already archived.']) {
    const key = mediaErrorKey(detail)
    assert.notEqual(key, 'media_request_failed')
    assert.ok(i18n.getResource('ta', 'common', key), detail)
  }
  assert.equal(mediaErrorKey('Unexpected diagnostic'), 'media_request_failed')
})
