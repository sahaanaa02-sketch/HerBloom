import assert from 'node:assert/strict'
import test from 'node:test'
import { isQuietHours } from './useReminders.js'

const at = (hour, minute = 0) => new Date(2026, 10, 20, hour, minute)

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
