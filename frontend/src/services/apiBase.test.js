import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveApiBase } from '../../apiConfig.js'

test('E2E authentication uses the exact isolated API and cannot fall back', () => {
  const location = { hostname: '127.0.0.1', port: '5183' }
  assert.equal(resolveApiBase('e2e', 'http://127.0.0.1:8100', location), 'http://127.0.0.1:8100')
  for (const url of [undefined, 'http://127.0.0.1:8000']) {
    assert.throws(() => resolveApiBase('e2e', url, location), /E2E requires VITE_API_URL/)
  }
  assert.throws(() => resolveApiBase('development', undefined, location), /--mode e2e/)
})

test('normal development and hosted API configuration remain unchanged', () => {
  assert.equal(resolveApiBase('development', undefined, { hostname: 'localhost', port: '5173' }),
    'http://127.0.0.1:8000')
  assert.equal(resolveApiBase('production', 'https://api.example.com'), 'https://api.example.com')
})
