import { apiBase as API } from './apiBase'
async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === 'string'
        ? data.detail
        : `Request failed (${response.status})`
    )
  }

  return data
}

export const chatApi = {
  sessions: (token) =>
    request('/chat/sessions', token),

  session: (token, id) =>
    request(`/chat/sessions/${id}`, token),

  deleteSession: (token, id) =>
    request(`/chat/sessions/${id}`, token, {
      method: 'DELETE',
    }),

  send: (token, payload, requestKey = crypto.randomUUID()) =>
    request('/chat/message', token, {
      method: 'POST',
      headers: { 'Idempotency-Key': requestKey },
      body: JSON.stringify(payload),
    }),

  feedback: (token, messageId, helpful, shareContent = false) =>
    request(`/chat/messages/${messageId}/feedback`, token, {
      method: 'POST',
      body: JSON.stringify({ helpful, share_content: shareContent }),
    }),

  consent: (token) =>
    request('/chat/consent', token),

  updateConsent: (token, enabled) =>
    request('/chat/consent', token, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
}
