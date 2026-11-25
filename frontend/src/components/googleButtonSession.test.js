import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGoogleButtonSession } from './googleButtonSession.js'

test('concurrent effects and remounts reuse the current Google initialization', async () => {
  const calls = []
  const getSession = createGoogleButtonSession(async () => ({
    provider: { initialize: (options) => calls.push(options) },
    result: { client_id: 'fixture', nonce: 'nonce', challenge: 'challenge' },
  }))
  const [first, second] = await Promise.all([getSession(), getSession()])
  assert.equal(first, second)
  const detach = first.attach(() => assert.fail('detached listener called'))
  detach()
  calls[0].callback({ credential: 'fixture' })
  assert.equal(await getSession(), first)
  let submitted = 0
  first.attach((_, challenge) => { assert.equal(challenge, 'challenge'); submitted++ })
  calls[0].callback({ credential: 'fixture' })
  calls[0].callback({ credential: 'fixture' })
  assert.equal(submitted, 1)
  assert.equal(calls.length, 1)
  assert.notEqual(await getSession(), first)
  assert.equal(calls.length, 2)
})

test('expired challenge cannot forward a credential', async () => {
  let time = 0
  let callback
  const getSession = createGoogleButtonSession(async () => ({
    provider: { initialize: (options) => { callback = options.callback } },
    result: {},
  }), () => time)
  const session = await getSession()
  let expired = false
  session.attach(() => assert.fail('expired challenge submitted'), () => { expired = true })
  time = 300000
  callback({ credential: 'fixture' })
  assert.equal(expired, true)
  assert.notEqual(await getSession(), session)
})

test('linking replaces the active Google button session without forwarding stale credentials', async () => {
  const calls = []
  const provider = { initialize: (options) => calls.push(options) }
  const session = (nonce) => createGoogleButtonSession(async () => ({ provider, result: { nonce } }))
  const signIn = session('sign-in')
  const link = session('link')
  const old = await signIn()
  old.attach(() => assert.fail('stale callback called'))
  const active = await link()
  calls[0].callback({ credential: 'fixture' })
  assert.equal(calls[1].nonce, 'link')
  assert.notEqual(await signIn(), old)
  assert.equal(active.isUsable(), false)
  assert.equal(calls[2].nonce, 'sign-in')
})
