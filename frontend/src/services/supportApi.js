import { apiBase } from './apiBase'
import { requestEntitlement } from './entitlementApi'

export async function publishedFaqs(language, signal) {
  const response = await fetch(apiBase + '/api/faqs?' + new URLSearchParams({language}), { signal })
  if (!response.ok) throw new Error('FAQs are unavailable')
  return response.json()
}

export function ticketRequest(token, path = '', body) {
  return requestEntitlement(token, '/api/support/tickets' + path, body)
}
