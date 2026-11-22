import { apiBase as API_URL } from './apiBase'
async function request(endpoint, token, options = {}) {
  if (!token) {
    throw new Error('Please log in to continue.')
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (response.status === 204) return

  let data

  try {
    data = await response.json()
  } catch {
    throw new Error('Unexpected server response.')
  }

  if (!response.ok) {
    const detail = data?.detail

    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg).join(', ')
          : 'Something went wrong. Please try again.'

    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return data
}

export async function revokeMotherSession(token) {
  try {
    await request('/auth/logout', token, { method: 'POST', signal: AbortSignal.timeout(5000) })
  } catch (error) {
    if (error.status !== 401) throw error
  }
}

// Retrieve saved onboarding answers
export function getMotherIdentity(token, signal) {
  return request('/auth/me', token, { signal })
}

export function getMotherProfile(token, signal) {
  return request('/profile', token, { signal })
}

// Save one onboarding step
export function saveOnboardingStep(step, answers, token, version = 1) {
  if (!Number.isInteger(step) || step < 1 || step > 5) {
    throw new Error('Invalid onboarding step.')
  }

  return request(`/profile/onboarding/${version === 2 ? 'v2/' : ''}${step}`, token, {
    method: 'PATCH',
    body: JSON.stringify(answers),
  })
}

// Mark onboarding as completed
export function completeOnboarding(token) {
  return request('/profile/onboarding/complete', token, {
    method: 'POST',
  })
}
