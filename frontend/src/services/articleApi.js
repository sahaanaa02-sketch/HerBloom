import { apiBase as API_URL } from './apiBase'
async function request(path, token) {
  if (!token) throw new Error('Please log in again.')

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
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

export function getArticles(token, { category = 'all', search = '' } = {}) {
  const params = new URLSearchParams()

  if (category !== 'all') params.set('category', category)
  if (search.trim()) params.set('search', search.trim())

  return request(`/articles?${params}`, token)
}

export function getArticle(token, id) {
  return request(`/articles/${id}`, token)
}

export function getArticlesForWeek(token) {
  return request('/articles/for-my-week?limit=3', token)
}