import { apiBase as API_URL } from './apiBase'
async function authRequest(path, body) {
  let response

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      'Cannot connect to the HerBloom server.'
    )
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : 'Authentication failed. Please try again.'
    )
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

export function verifyAdmin2FA(challengeToken, code) {
  return authRequest('/api/admin/auth/2fa/verify', {
    challenge_token: challengeToken,
    code,
  })
}
