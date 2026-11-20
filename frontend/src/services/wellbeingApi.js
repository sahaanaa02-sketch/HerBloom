import { apiBase as API_URL } from './apiBase'
async function request(path, token, options = {}) {
  const response = await fetch(`${API_URL}/wellbeing${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = 'Something went wrong.'

    try {
      const data = await response.json()
      message =
        typeof data.detail === 'string'
          ? data.detail
          : message
    } catch {
      // Keep the default message
    }

    throw new Error(message)
  }

  return response.json()
}

export const getWellbeingStatus = (token) =>
  request('/status', token)

export const submitWellbeingCheckin = (token, data) =>
  request('/checkins', token, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const getWellbeingHistory = (token) =>
  request('/checkins?days=30', token)

export const getWellbeingSuggestions = (token) =>
  request('/suggestions', token)

export const getWellbeingActivities = (token) =>
  request('/activities', token)

export const completeWellbeingActivity = (token, activity_id) =>
  request('/activities/complete', token, {
    method: 'POST',
    body: JSON.stringify({ activity_id }),
  })

export const getJournalEntries = (token) =>
  request('/journal', token)

export const saveJournalEntry = (token, data) =>
  request('/journal', token, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const deleteJournalEntry = (token, id) =>
  request(`/journal/${id}`, token, {
    method: 'DELETE',
  })
