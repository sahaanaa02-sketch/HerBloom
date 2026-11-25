import test from 'node:test'
import assert from 'node:assert/strict'
import { portalRoute, portalUrl } from './portalRouting.js'

const origin = 'http://localhost:5173'

test('portal pages and tabs survive reconstruction from the browser URL', () => {
  for (const [portal, pages] of [
    ['/admin', ['overview', 'users', 'content', 'nutrition', 'safety', 'review', 'settings', 'ai', 'notifications', 'subscriptions', 'analytics', 'support']],
    ['/mother', ['dashboard', 'nutrition', 'wellbeing', 'recovery', 'chat', 'learn', 'weekly', 'settings']],
  ]) {
    for (const page of pages) {
      const path = portalUrl(new URL('/login', origin), portal, { page })
      assert.equal(portalRoute(new URL(path, origin), portal).page, page)
    }
  }
  const article = new URL('/mother?page=learn&article=42', origin)
  assert.equal(portalRoute(article, '/mother').articleId, 42)
  assert.deepEqual(portalRoute(article, '/admin'), {})
})

test('same-portal navigation preserves unrelated URL parameters and hash', () => {
  const current = new URL('/admin?page=content&section=exercises&filter=recent#details', origin)
  const path = portalUrl(current, '/admin', { page: 'analytics' })
  const next = new URL(path, origin)
  assert.equal(next.searchParams.get('filter'), 'recent')
  assert.equal(next.searchParams.get('section'), null)
  assert.equal(next.hash, '#details')
  assert.equal(portalUrl(current, '/mother', { page: 'settings', section: 'plan' }),
    '/mother?page=settings&section=plan')
})
