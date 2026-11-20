import { apiBase } from './apiBase'

export async function requestEntitlement(token, path, body, headers = {}) {
  const response = await fetch(apiBase + path, {
    cache: 'no-store',
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      ...headers,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}
