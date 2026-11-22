import { apiBase as API } from './apiBase'
async function request(path, token, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = data?.detail

    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e) => e.msg).join(', ')
          : `Request failed (${response.status})`

    throw Object.assign(new Error(message), { status: response.status })
  }

  return data
}

export const nutritionApi = {
  foods: (token, query = '') =>
    request(
      `/nutrition/foods?q=${encodeURIComponent(query)}`,
      token
    ),

  today: (token) =>
    request('/nutrition/today', token),

  logs: (token, date = '') =>
    request(
      `/nutrition/logs${date ? `?date=${date}` : ''}`,
      token
    ),

  addMeal: (token, payload, requestKey) =>
    request('/nutrition/meals', token, {
      method: 'POST',
      headers: requestKey ? { 'Idempotency-Key': requestKey } : undefined,
      body: JSON.stringify(payload),
    }),

  editMeal: (token, id, payload) =>
    request(`/nutrition/meals/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteMeal: (token, id) =>
    request(`/nutrition/meals/${id}`, token, {
      method: 'DELETE',
    }),

  favourites: (token) =>
    request('/nutrition/favourites', token),

  addFavourite: (token, id) =>
    request(`/nutrition/favourites/${id}`, token, {
      method: 'POST',
    }),

  removeFavourite: (token, id) =>
    request(`/nutrition/favourites/${id}`, token, {
      method: 'DELETE',
    }),

  ideas: (token) =>
    request('/nutrition/ideas', token),

  mealPlan: (token) =>
    request('/nutrition/meal-plan', token),

  planHistory: (token) =>
    request('/nutrition/meal-plan/history', token),

  planDetail: (token, id) =>
    request(`/nutrition/meal-plan/history/${id}`, token),

  generatePlan: (token) =>
    request('/nutrition/meal-plan/generate', token, {
      method: 'POST',
    }),

  markEaten: (token, id, eaten) =>
    request(`/nutrition/meal-plan/items/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ eaten }),
    }),

  swapMeal: (token, id) =>
    request(`/nutrition/meal-plan/items/${id}/swap`, token, {
      method: 'POST',
    }),

  anaemia: (token) =>
    request('/nutrition/anaemia', token),

  saveHb: (token, payload) =>
    request('/nutrition/anaemia/hb', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteHb: (token, id) =>
    request(`/nutrition/anaemia/hb/${id}`, token, {
      method: 'DELETE',
    }),

  gdm: (token) =>
    request('/nutrition/gdm', token),

  hydration: (token) =>
    request('/dashboard/hydration', token),

  addWater: (token, glasses = 1) =>
    request('/dashboard/hydration/add', token, {
      method: 'POST',
      body: JSON.stringify({ glasses }),
    }),

  scan: (token, file, requestKey = crypto.randomUUID(), consent = false) => {
    const form = new FormData()
    form.append('file', file)
    if (consent === true) form.append('consent', 'true')

    return request('/nutrition/scan', token, {
      method: 'POST',
      headers: { 'Idempotency-Key': requestKey },
      body: form,
    })
  },
}
