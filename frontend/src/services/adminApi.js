import { apiBase as API_URL } from './apiBase'
async function adminRequest(
  path,
  token,
  options = {},
  responseType = 'json'
) {
  if (!token) {
    throw new Error(
      'Admin session is missing. Please log in.'
    )
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...options.headers,
      },
    }
  )

  if (response.status === 401) {
    throw new Error(
      'Your session has expired. Please log in again.'
    )
  }

  if (response.status === 403) {
    throw new Error(
      'You do not have permission to access this page.'
    )
  }

  if (!response.ok) {
    let message = `Admin API error: ${response.status}`

    try {
      const data = await response.json()
      if (typeof data.detail === 'string') {
        message = data.detail
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map(({ loc, msg }) => `${loc?.slice(1).join('.') || 'Article'}: ${msg}`).join(' ')
      }
    } catch {
      // Keep default error message.
    }

    throw new Error(message)
  }

  return responseType === 'blob' ? response.blob() : response.json()
}


// ==========================================
// Existing Admin APIs
// ==========================================

export function getAdminProfile(token) {
  return adminRequest('/api/admin/me', token)
}

export function getAdminOverview(token, safetyDate) {
  const query = safetyDate ? '?' + new URLSearchParams({ safety_date: safetyDate }) : ''
  return adminRequest('/api/admin/overview' + query, token)
}


// ==========================================
// Media Library APIs
// ==========================================

export function getAdminMedia(
  token,
  {
    page = 1,
    pageSize = 10,
    search = '',
    mediaType = '',
    status = '',
  } = {}
) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })

  if (search) {
    params.set('search', search)
  }

  if (mediaType) {
    params.set('media_type', mediaType)
  }

  if (status) {
    params.set('status', status)
  }

  return adminRequest(
    `/api/admin/media?${params.toString()}`,
    token
  )
}

export function uploadAdminMedia(token, file) {
  const formData = new FormData()
  formData.append('file', file)

  return adminRequest(
    '/api/admin/media',
    token,
    {
      method: 'POST',
      body: formData,
    }
  )
}

export function archiveAdminMedia(token, mediaId) {
  return adminRequest(
    `/api/admin/media/${mediaId}`,
    token,
    {
      method: 'DELETE',
    }
  )
}

export function getAdminArticles(token, filters) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== '' && value != null) params.set(name, String(value))
  }
  return adminRequest(`/api/admin/articles?${params}`, token)
}

export function getAdminArticle(token, id) {
  return adminRequest(`/api/admin/articles/${id}`, token)
}

export function saveAdminArticle(token, id, draft) {
  return adminRequest(id ? `/api/admin/articles/${id}` : '/api/admin/articles', token, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

export function getAdminMediaFile(token, id, accept) {
  return adminRequest(`/api/admin/media/${id}/file`, token, {
    headers: { Accept: accept },
  }, 'blob')
}

export function getAdminMediaImage(token, id) {
  return getAdminMediaFile(token, id, 'image/*')
}

export function submitAdminArticleForReview(token, id) {
  return adminRequest(`/api/admin/articles/${id}/submit`, token, { method: 'POST' })
}

export function archiveAdminArticle(token, id) {
  return adminRequest(`/api/admin/articles/${id}`, token, { method: 'DELETE' })
}

export function getAdminExercises(token, filters) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== '' && value != null) params.set(name, String(value))
  }
  return adminRequest(`/api/admin/exercises?${params}`, token)
}

export function getAdminExercise(token, id) {
  return adminRequest(`/api/admin/exercises/${id}`, token)
}

export function saveAdminExercise(token, id, draft) {
  return adminRequest(id ? `/api/admin/exercises/${id}` : '/api/admin/exercises', token, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

export function submitAdminExercise(token, id) {
  return adminRequest(`/api/admin/exercises/${id}/submit`, token, { method: 'POST' })
}

export function archiveAdminExercise(token, id) {
  return adminRequest(`/api/admin/exercises/${id}`, token, { method: 'DELETE' })
}

export function getAdminActivities(token, filters) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== '' && value != null) params.set(name, String(value))
  }
  return adminRequest(`/api/admin/wellbeing-activities?${params}`, token)
}

export function getAdminActivity(token, id) {
  return adminRequest(`/api/admin/wellbeing-activities/${id}`, token)
}

export function saveAdminActivity(token, id, draft) {
  return adminRequest(id ? `/api/admin/wellbeing-activities/${id}` : '/api/admin/wellbeing-activities', token, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

export function submitAdminActivity(token, id) {
  return adminRequest(`/api/admin/wellbeing-activities/${id}/submit`, token, { method: 'POST' })
}

export function archiveAdminActivity(token, id) {
  return adminRequest(`/api/admin/wellbeing-activities/${id}`, token, { method: 'DELETE' })
}

export function getAdminMeals(token, filters) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== '' && value != null) params.set(name, String(value))
  }
  return adminRequest(`/api/admin/meal-ideas?${params}`, token)
}

export function getAdminMeal(token, id) {
  return adminRequest(`/api/admin/meal-ideas/${id}`, token)
}

export function searchAdminMealFoods(token, search) {
  return adminRequest(`/api/admin/meal-ideas/foods?${new URLSearchParams({ search })}`, token)
}

export function previewAdminMealNutrients(token, ingredients) {
  return adminRequest('/api/admin/meal-ideas/nutrients', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredients }),
  })
}

export function saveAdminMeal(token, id, draft) {
  return adminRequest(id ? `/api/admin/meal-ideas/${id}` : '/api/admin/meal-ideas', token, {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
  })
}

export function submitAdminMeal(token, id) {
  return adminRequest(`/api/admin/meal-ideas/${id}/submit`, token, { method: 'POST' })
}

export function archiveAdminMeal(token, id) {
  return adminRequest(`/api/admin/meal-ideas/${id}`, token, { method: 'DELETE' })
}

export function nutritionAdminRequest(token, path, method = 'GET', data, responseType = 'json') {
  const options = { method }
  if (data instanceof FormData) options.body = data
  else if (data != null) {
    options.body = JSON.stringify(data)
    options.headers = { 'Content-Type': 'application/json' }
  }
  return adminRequest('/api/admin' + path, token, options, responseType)
}

export function safetyAdminRequest(token, path, method = 'GET', data) {
  return adminRequest('/api/admin/safety' + path, token, {
    method,
    ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  })
}

export function clinicalReviewRequest(token, path, method = 'GET', data) {
  return adminRequest('/api/admin/reviews' + path, token, {
    method,
    ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  })
}

export function usersAdminRequest(token, path, method = 'GET', data, output = 'json') {
  return adminRequest('/api/admin' + path, token, {
    method,
    ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  }, output)
}

export function settingsAdminRequest(token, path, method = 'GET', data, output = 'json') {
  return adminRequest('/api/admin/settings' + path, token, {
    method,
    ...(data !== undefined ? { headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) } : {}),
  }, output)
}

export function aiAdminRequest(token, path, method = 'GET', data) {
  return adminRequest('/api/admin/ai' + path, token, {
    method,
    ...(data !== undefined ? { headers:{'Content-Type':'application/json'},body:JSON.stringify(data) } : {}),
  })
}

export function notificationsRequest(token, path, method = 'GET', body, signal) {
  return adminRequest('/api/admin/notifications' + path, token, {
    method,
    signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

export function billingAdminRequest(token, path, method = 'GET') {
  return adminRequest('/api/admin/billing' + path, token, { method })
}

export function a13AdminRequest(token, path, method = 'GET', data, output = 'json') {
  return adminRequest('/api/admin' + path, token, {
    method,
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  }, output)
}
