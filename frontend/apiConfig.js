const DEVELOPMENT_API = 'http://127.0.0.1:8000'
const E2E_API = 'http://127.0.0.1:8100'

export function resolveApiBase(mode, url) {
  if (mode === 'e2e' && url !== E2E_API) {
    throw new Error('E2E requires VITE_API_URL=http://127.0.0.1:8100')
  }
  return url || DEVELOPMENT_API
}
