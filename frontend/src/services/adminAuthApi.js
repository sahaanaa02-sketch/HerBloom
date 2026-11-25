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

export async function startAdminSignIn(email, password) {
  const result = await loginAdmin(email, password)
  if (typeof result.access_token !== 'string' || !result.access_token.trim() ||
      !Array.isArray(result.admin?.permissions)) {
    throw new Error('Unexpected admin login response.')
  }
  return { admin: { ...result.admin, access_token: result.access_token, adminAuthenticated: true } }
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
  if (!response.ok) throw Object.assign(new Error('Admin session could not be restored.'), { status: response.status })
  const admin = await response.json()
  if (!Array.isArray(admin.permissions)) throw new Error('Invalid Admin session.')
  return { ...admin, access_token: token, role: 'ADMIN', adminAuthenticated: true }
}
