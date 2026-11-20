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

    throw new Error(message)
  }

  return data
}

// Retrieve saved onboarding answers
export function getMotherProfile(token) {
  return request('/profile', token)
}

// Save one onboarding step
export function saveOnboardingStep(step, answers, token) {
  if (!Number.isInteger(step) || step < 1 || step > 5) {
    throw new Error('Invalid onboarding step.')
  }

  return request(`/profile/onboarding/${step}`, token, {
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
