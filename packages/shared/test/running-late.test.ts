import assert from 'node:assert/strict'
import test from 'node:test'
import { playIntentRecipientResponseRequestSchema } from '../src/index.js'
import {
  formatRunningLateLabel,
  parseRunningLateMinutes,
} from '../src/running-late.js'

test('late requests preserve unknown estimates and accept whole minutes at both bounds', () => {
  for (const runningLateMinutes of [undefined, null, 1, 15, 1440]) {
    assert.equal(
      playIntentRecipientResponseRequestSchema.safeParse({
        choice: 'late',
        runningLateMinutes,
      }).success,
      true,
    )
  }
  assert.equal(parseRunningLateMinutes('  ').data, null)
  assert.equal(parseRunningLateMinutes('15').data, 15)
})

test('invalid estimates and estimates on other responses are rejected', () => {
  for (const runningLateMinutes of [0, -1, 1.5, 1441, Infinity, '15']) {
    assert.equal(
      playIntentRecipientResponseRequestSchema.safeParse({
        choice: 'late',
        runningLateMinutes,
      }).success,
      false,
    )
  }
  for (const choice of ['interested', 'pass', 'join', 'decline']) {
    assert.equal(
      playIntentRecipientResponseRequestSchema.safeParse({
        choice,
        runningLateMinutes: 15,
      }).success,
      false,
    )
  }
  assert.equal(parseRunningLateMinutes('later').success, false)
})

test('legacy response aliases remain compatible and labels handle unknown and singular estimates', () => {
  assert.equal(
    playIntentRecipientResponseRequestSchema.parse({ choice: 'join' }).choice,
    'interested',
  )
  assert.equal(
    playIntentRecipientResponseRequestSchema.parse({ choice: 'decline' })
      .choice,
    'pass',
  )
  assert.equal(formatRunningLateLabel(), 'Running late')
  assert.equal(formatRunningLateLabel(1), 'About 1 minute late')
  assert.equal(formatRunningLateLabel(15), 'About 15 minutes late')
})
