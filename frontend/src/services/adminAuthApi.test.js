import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { resolveSharedLogin } from './sharedLogin.js'

let server
let api
before(async () => {
  server = await createServer({
    configFile: false,
    envDir: false,
    mode: 'e2e',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('http://127.0.0.1:8100') },
    server: { middlewareMode: true, ws: false },
  })
  api = await server.ssrLoadModule('/src/services/adminAuthApi.js')
})
after(async () => { await server?.close() })

test('shared Mother login does not start an Admin challenge', async () => {
  const payload = { user: { role: 'MOTHER' }, access_token: 'synthetic' }
  const result = await resolveSharedLogin(Response.json(payload), true, () => assert.fail())
  assert.deepEqual(result, { mother: payload })
})

test('isolated Admin sign-in rejects a challenge without a session', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'http://127.0.0.1:8100/api/admin/auth/login')
    return Response.json({ requires_2fa: true, challenge_token: 'synthetic-challenge', setup_required: false })
  })
  await assert.rejects(resolveSharedLogin(Response.json({}, { status: 401 }), true,
    () => api.startAdminSignIn('admin@example.test', 'synthetic')), /did not issue a password-only session/)
})

test('verification request passes cancellation through to fetch', async (context) => {
  const controller = new AbortController()
  context.mock.method(globalThis, 'fetch', (_, options) => {
    assert.equal(options.signal, controller.signal)
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  })
  const request = api.verifyAdmin2FA('synthetic-challenge', '000000', controller.signal)
  controller.abort()
  await assert.rejects(request, { name: 'AbortError' })
})


test('direct Admin sign-in returns a server session without opening verification', async (context) => {
  let requests = 0
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json({ requires_2fa: false, access_token: 'synthetic',
      admin: { permissions: ['overview.view'] } })
  })
  const result = await resolveSharedLogin(Response.json({}, { status: 401 }), true,
    () => api.startAdminSignIn('admin@example.test', 'synthetic'))
  assert.deepEqual(result, { admin: { permissions: ['overview.view'],
    access_token: 'synthetic', adminAuthenticated: true } })
  assert.equal(requests, 1)
})

