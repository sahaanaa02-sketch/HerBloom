import { apiBase as API_URL } from './apiBase'
async function request(path, token, options = {}) {
  if (!token) {
    throw new Error('Please log in again.')
  }

  let response

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Cannot connect to HerBloom server.')
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`

    try {
      const result = await response.json()

      if (typeof result.detail === 'string') {
        message = result.detail
      } else if (Array.isArray(result.detail)) {
        message = result.detail
          .map((item) => item.msg)
          .join(', ')
      }
    } catch {
      // Keep default error.
    }

    throw new Error(message)
  }

  if (response.status === 204) return null

  return response.json()
}


// DASHBOARD

export function getDashboardToday(token) {
  return request('/dashboard/today', token)
}

export function getDashboardStage(token) {
  return request('/dashboard/stage', token)
}

export function getDashboardWeekly(token) {
  return request('/dashboard/weekly', token)
}


// HYDRATION

export function getHydration(token) {
  return request('/dashboard/hydration', token)
}

export function addHydration(token, glasses = 1) {
  return request('/dashboard/hydration/add', token, {
    method: 'POST',
    body: JSON.stringify({ glasses }),
  })
}

export function setHydration(token, glasses) {
  return request('/dashboard/hydration', token, {
    method: 'PUT',
    body: JSON.stringify({ glasses }),
  })
}


// TO-DO

export function getDashboardTodos(token) {
  return request('/dashboard/todos', token)
}

export function createDashboardTodo(token, title) {
  return request('/dashboard/todos', token, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function updateDashboardTodo(token, id, changes) {
  return request(`/dashboard/todos/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function deleteDashboardTodo(token, id) {
  return request(`/dashboard/todos/${id}`, token, {
    method: 'DELETE',
  })
}


// REMINDERS

export function getDashboardReminders(token) {
  return request('/dashboard/reminders', token)
}

export function createDashboardReminder(token, data) {
  return request('/dashboard/reminders', token, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateDashboardReminder(token, id, changes) {
  return request(`/dashboard/reminders/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function deleteDashboardReminder(token, id) {
  return request(`/dashboard/reminders/${id}`, token, {
    method: 'DELETE',
  })
}
