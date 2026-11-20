
import { useEffect, useRef, useState } from 'react'

function isQuietHours(date) {
  const hour = date.getHours()
  return hour >= 22 || hour < 6
}

export default function useReminders(reminders = []) {
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
    if (permission !== 'granted') return

    const checkReminders = () => {
      const now = new Date()

      if (isQuietHours(now)) return

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
  }, [reminders, permission])

  return {
    permission,
    requestPermission,
  }
}
