import { apiBase as API_BASE_URL } from './apiBase'
function getCurrentMonday() {
  const today = new Date()

  const day = today.getDay()
  const daysSinceMonday = (day + 6) % 7

  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - daysSinceMonday
  )

  return formatLocalDate(monday)
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function shiftWeek(weekStart, amount) {
  const [year, month, day] = weekStart.split('-').map(Number)

  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount * 7)

  return formatLocalDate(date)
}

async function getWeeklyReport(accessToken, weekStart = null) {
  if (!accessToken) {
    throw new Error('Please log in to view your weekly summary.')
  }

  const params = new URLSearchParams()

  if (weekStart) {
    params.set('week_start', weekStart)
  }

  const query = params.toString()
  const url = `${API_BASE_URL}/reports/weekly${query ? `?${query}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  let result = null

  try {
    result = await response.json()
  } catch {
    throw new Error('Unable to read the weekly report response.')
  }

  if (!response.ok) {
    const detail = result?.detail

    const message =
      typeof detail === 'string'
        ? detail
        : response.status === 401
          ? 'Your session has expired. Please log in again.'
          : response.status === 403
            ? 'This page is available to mother accounts only.'
            : 'Unable to load your weekly summary.'

    throw new Error(message)
  }

  return result
}

export {
  getWeeklyReport,
  getCurrentMonday,
  formatLocalDate,
  shiftWeek,
}
