import assert from 'node:assert/strict'
import test from 'node:test'
import { isActiveReminder, isQuietHours, isReminderDue, reminderTimestamp } from './useReminders.js'

const at = (hour, minute = 0) =>
  new Date(`2026-11-20T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`)

test('default quiet hours start at 22:00 and end at 06:00', () => {
  assert.equal(isQuietHours(at(22)), true)
  assert.equal(isQuietHours(at(6)), false)
})

test('saved overnight preferences respect minute boundaries', () => {
  assert.equal(isQuietHours(at(21, 29), '21:30', '07:15'), false)
  assert.equal(isQuietHours(at(21, 30), '21:30', '07:15'), true)
  assert.equal(isQuietHours(at(7, 14), '21:30', '07:15'), true)
  assert.equal(isQuietHours(at(7, 15), '21:30', '07:15'), false)
})

test('daytime preferences and unusable settings keep their expected behavior', () => {
  assert.equal(isQuietHours(at(12), '11:30', '13:15'), true)
  assert.equal(isQuietHours(at(3), '11:30', '13:15'), false)
  assert.equal(isQuietHours(at(5), 'invalid', '06:00'), true)
  assert.equal(isQuietHours(at(5), '18:00', '18:00'), true)
})


test('Colombo wall-clock reminders use the same instant in any browser timezone', () => {
  const reminder = { remind_at: '2026-11-20T22:00:00', completed: false }
  const instant = new Date('2026-11-20T16:30:00Z')
  assert.equal(reminderTimestamp(reminder.remind_at), instant.getTime())
  assert.equal(reminderTimestamp('2026-11-20T16:30:00Z'), instant.getTime())
  assert.equal(isReminderDue(reminder, instant), true)
  assert.equal(isReminderDue(reminder, new Date('2026-11-20T16:29:59Z')), false)
  assert.equal(isReminderDue(reminder, new Date('2026-11-20T16:31:00Z')), false)
  assert.equal(isQuietHours(instant), true)
})

test('completed, cancelled, inactive and invalid reminders are never due', () => {
  const now = new Date('2026-11-20T16:30:00Z')
  const reminder = { remind_at: '2026-11-20T22:00:00' }
  for (const state of [
    { completed: true }, { cancelled: true }, { canceled: true },
    { active: false }, { is_active: false }, { status: 'inactive' },
    { status: 'CANCELLED' }, { status: 'completed' },
  ]) {
    assert.equal(isActiveReminder({ ...reminder, ...state }), false)
    assert.equal(isReminderDue({ ...reminder, ...state }, now), false)
  }
  assert.equal(isReminderDue({ remind_at: 'not a time' }, now), false)
})
