import { apiBase as API_URL } from './apiBase'
async function authRequest(path, body, signal) {
  let response

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(
      'Cannot connect to the HerBloom server.'
    )
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw Object.assign(new Error(
      typeof data.detail === 'string'
        ? data.detail
        : 'Authentication failed. Please try again.'
    ), { status: response.status })
  }

  return data
}

export function loginAdmin(email, password) {
  return authRequest('/api/admin/auth/login', {
    email,
    password,
  })
}

export function setupAdmin2FA(challengeToken) {
  return authRequest('/api/admin/auth/2fa/setup', {
    challenge_token: challengeToken,
  })
}

export async function startAdminSignIn(email, password) {
  const result = await loginAdmin(email, password)
  if (result.requires_2fa === false && typeof result.access_token === 'string' &&
      result.access_token.trim() && Array.isArray(result.admin?.permissions)) {
    return { admin: { ...result.admin, access_token: result.access_token, adminAuthenticated: true } }
  }
  if (import.meta.env.MODE === 'e2e') {
    throw new Error('The isolated Admin API did not issue a password-only session. Verify that the Login page is on port 5183 and the E2E API is on port 8100.')
  }
  if (result.requires_2fa !== true || typeof result.challenge_token !== 'string' || !result.challenge_token) {
    throw new Error('Unexpected admin login response.')
  }
  let setupKey = ''
  if (result.setup_required) {
    const setup = await setupAdmin2FA(result.challenge_token)
    setupKey = new URL(setup.otpauth_uri).searchParams.get('secret')
    if (!setupKey) throw new Error('Authenticator setup key missing.')
  }
  return { challenge: { token: result.challenge_token, setupKey } }
}

export function verifyAdmin2FA(challengeToken, code, signal) {
  return authRequest('/api/admin/auth/2fa/verify', {
    challenge_token: challengeToken,
    code,
  }, signal)
}

export async function revokeAdminSession(token) {
  const response = await fetch(API_URL + '/api/admin/auth/logout', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok && response.status !== 401) throw new Error('Admin session revocation could not be confirmed.')
}

export async function getAdminSession(token, signal) {
  const response = await fetch(API_URL + '/api/admin/me', {
    headers: { Authorization: 'Bearer ' + token },
    signal,
  })
  if (!response.ok) throw new Error('Admin session could not be restored.')
  const admin = await response.json()
  if (!Array.isArray(admin.permissions)) throw new Error('Invalid Admin session.')
  return { ...admin, access_token: token, role: 'ADMIN', adminAuthenticated: true }
}
