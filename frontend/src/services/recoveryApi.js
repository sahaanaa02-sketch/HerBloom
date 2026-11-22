import { apiBase } from './apiBase'
const BASE = apiBase + "/recovery"

async function request(token, path, method = 'GET', body, base = BASE) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw Object.assign(new Error(
      typeof error.detail === 'string'
        ? error.detail
        : `Request failed (${response.status})`
    ), { status: response.status })
  }

  return response.json()
}

export const recoveryApi = {
  warningSigns: (token) => request(token, '/warning-signs', 'GET', undefined, apiBase + '/safety'),
  helplines: (token) => request(token, '/helplines', 'GET', undefined, apiBase + '/safety'),

  context: (token) =>
    request(token, '/context'),

  saveContext: (token, body) =>
    request(token, '/context', 'PUT', body),

  summary: (token) =>
    request(token, '/summary'),

  sleep: (token, start, end) =>
    request(
      token,
      `/sleep?start=${start}&end=${end}`
    ),

  addSleep: (token, body) =>
    request(token, '/sleep', 'POST', body),

  updateSleep: (token, id, body) =>
    request(token, `/sleep/${id}`, 'PUT', body),

  deleteSleep: (token, id) =>
    request(token, `/sleep/${id}`, 'DELETE'),

  walks: (token, start, end) =>
    request(
      token,
      `/walks?start=${start}&end=${end}`
    ),

  addWalk: (token, body) =>
    request(token, '/walks', 'POST', body),

  updateWalk: (token, id, body) =>
    request(token, `/walks/${id}`, 'PUT', body),

  deleteWalk: (token, id) =>
    request(token, `/walks/${id}`, 'DELETE'),

  bodyChecks: (token) =>
    request(token, '/body-checks'),

  addBodyCheck: (token, body) =>
    request(token, '/body-checks', 'POST', body),

  updateBodyCheck: (token, id, body) =>
    request(token, `/body-checks/${id}`, 'PUT', body),

  deleteBodyCheck: (token, id) =>
    request(token, `/body-checks/${id}`, 'DELETE'),

  exercises: (token) =>
    request(token, '/exercises/for-me'),

  todayExercises: (token) =>
    request(token, '/exercises/today'),

  completeExercise: (token, body) =>
    request(token, '/exercise-sessions', 'POST', body),

  calendar: (token, year, month) =>
    request(
      token,
      `/calendar?year=${year}&month=${month}`
    ),
}
