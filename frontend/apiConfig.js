const DEVELOPMENT_API = 'http://127.0.0.1:8000'
const E2E_API = 'http://127.0.0.1:8100'

export const E2E_FRONTEND_PORT = 5183

export function resolveApiBase(mode, url, location) {
  if (mode !== 'e2e' && location?.port === String(E2E_FRONTEND_PORT) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    throw new Error('Port 5183 requires the HerBloom frontend to start with --mode e2e')
  }
  if (mode === 'e2e' && url !== E2E_API) {
    throw new Error('E2E requires VITE_API_URL=http://127.0.0.1:8100')
  }
  return url || DEVELOPMENT_API
}
