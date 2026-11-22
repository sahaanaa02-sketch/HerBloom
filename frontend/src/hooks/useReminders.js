
import { useEffect, useRef, useState } from 'react'

export const REMINDER_TIME_ZONE = 'Asia/Colombo'
const colomboClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: REMINDER_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function reminderTimestamp(value) {
  if (typeof value !== 'string' || !value) return NaN
  // The API stores naive Sri Lankan wall-clock times. Current Colombo scheduling uses UTC+05:30.
  const local = value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(local) ? local : local + '+05:30')
}

export function isActiveReminder(reminder) {
  const status = reminder.status?.toLowerCase()
  return !reminder.completed && !reminder.cancelled && !reminder.canceled &&
    reminder.active !== false && reminder.is_active !== false &&
    !['completed', 'cancelled', 'canceled', 'inactive'].includes(status)
}

export function isReminderDue(reminder, now) {
  const elapsed = now.getTime() - reminderTimestamp(reminder.remind_at)
  return isActiveReminder(reminder) && elapsed >= 0 && elapsed < 60_000
}

export function isQuietHours(date, from = '22:00', to = '06:00') {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!clock.test(from) || !clock.test(to) || from === to) {
    from = '22:00'
    to = '06:00'
  }
  const now = colomboClock.format(date)
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
        if (isReminderDue(reminder, now) && !notified.current.has(reminder.id)) {
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
