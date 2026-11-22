import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDashboardQuickAction } from './dashboardQuickNavigation.js'

for (const [action, expected] of [
  ['scan', ['navigate', 'nutrition', { openScanner: true }]],
  ['water', ['log', 'water']],
  ['breathing', ['navigate', 'wellbeing', { openBreathing: true }]],
  ['ask', ['navigate', 'chat']],
]) {
  test(`Dashboard quick action ${action} invokes its feature directly`, () => {
    const calls = []
    runDashboardQuickAction(action,
      (...args) => calls.push(['navigate', ...args]),
      (...args) => calls.push(['log', ...args]))
    assert.deepEqual(calls, [expected])
  })
}
