import { apiBase as API_URL } from './apiBase'
async function profileRequest(path, token, options = {}) {
  if (!token) {
    throw new Error('Please log in again.')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = data?.detail

    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) => item.msg)
              .filter(Boolean)
              .join(', ')
          : 'Something went wrong. Please try again.'

    throw new Error(message)
  }

  return data
}

export async function getProfile(token) {
  return profileRequest('/profile', token)
}

export async function updateProfile(token, changes) {
  return profileRequest('/profile', token, {
    method: 'PUT',
    body: JSON.stringify(changes),
  })
}
