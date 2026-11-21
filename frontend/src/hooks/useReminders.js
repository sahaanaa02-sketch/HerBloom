
import { useEffect, useRef, useState } from 'react'

export function isQuietHours(date, from = '22:00', to = '06:00') {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!clock.test(from) || !clock.test(to) || from === to) {
    from = '22:00'
    to = '06:00'
  }
  const now = [date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, '0')).join(':')
  return from < to ? now >= from && now < to : now >= from || now < to
}

export default function useReminders(reminders = [], preferences = null) {
  const quietFrom = preferences?.quiet_from
  const quietTo = preferences?.quiet_to
  const preferencesLoaded = preferences !== null
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === 'undefined') {
      return 'unsupported'
    }

    return Notification.permission
  })

  const notified = useRef(new Set())

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      return 'unsupported'
    }

    if (Notification.permission === 'granted') {
      setPermission('granted')
      return 'granted'
    }

    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  useEffect(() => {
    if (permission !== 'granted' || !preferencesLoaded) return

    const checkReminders = () => {
      const now = new Date()

      if (isQuietHours(now, quietFrom, quietTo)) return

      reminders.forEach((reminder) => {
        if (!reminder.remind_at) return

        const reminderTime = new Date(reminder.remind_at)
        const difference = now.getTime() - reminderTime.getTime()

        if (
          difference >= 0 &&
          difference < 60000 &&
          !notified.current.has(reminder.id)
        ) {
          notified.current.add(reminder.id)

          try {
            new Notification('HerBloom Reminder', {
              body: reminder.title,
            })
          } catch (error) {
            console.error('Notification error:', error)
          }
        }
      })
    }

    checkReminders()

    const interval = setInterval(checkReminders, 15000)

    return () => clearInterval(interval)
  }, [reminders, permission, preferencesLoaded, quietFrom, quietTo])

  return {
    permission,
    requestPermission,
  }
}
