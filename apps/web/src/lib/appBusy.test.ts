/** Unit tests for the app-busy registry that holds automatic reloads. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  holdAppBusy,
  isAppBusy,
  resetAppBusyForTests,
  setAppBusy,
  subscribeAppBusy,
} from './appBusy'

test('overlapping holders keep the app busy until the last releases', () => {
  resetAppBusyForTests()
  const first = holdAppBusy('dialog-open')
  const second = holdAppBusy('dialog-open')
  first()
  first()
  assert.equal(isAppBusy(), true)
  second()
  assert.equal(isAppBusy(), false)
})

test('listeners hear only transitions between busy and idle', () => {
  resetAppBusyForTests()
  let calls = 0
  subscribeAppBusy(() => {
    calls += 1
  })
  setAppBusy('dialog-open', true)
  const release = holdAppBusy('dialog-open')
  release()
  setAppBusy('dialog-open', false)
  assert.equal(calls, 2)
})
