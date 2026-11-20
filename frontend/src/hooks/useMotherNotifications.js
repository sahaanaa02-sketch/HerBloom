import { useEffect, useState } from 'react'
import { apiBase } from '../services/apiBase'

export function useMotherNotifications(token, path, fallback) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetch(apiBase + path, {
      headers: { Authorization: 'Bearer ' + token },
      signal: controller.signal,
    }).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) setResult({ token, path, data }) })
      .catch(() => {})
    return () => controller.abort()
  }, [token, path])
  return result?.token === token && result?.path === path ? result.data ?? fallback : fallback
}
