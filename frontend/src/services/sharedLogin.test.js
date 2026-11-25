import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveSharedLogin } from './sharedLogin.js'

test('Google responses cannot authenticate an Admin through the Mother endpoint', async () => {
  for (const payload of [{ user: { role: 'ADMIN' }, access_token: 'synthetic' }, { challenge_token: 'synthetic' }]) {
    await assert.rejects(resolveSharedLogin(Response.json(payload), false))
  }
})
