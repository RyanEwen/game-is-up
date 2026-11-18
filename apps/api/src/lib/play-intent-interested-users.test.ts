import assert from 'node:assert/strict'
import test from 'node:test'

import { isInterestedPlayIntentWindowBlockingAutoPrompt } from './play-intent-interested-users.js'

test('blocks auto-prompt when the interested call to play is already live', () => {
  const now = new Date('2026-05-14T18:00:00.000Z')

  assert.equal(
    isInterestedPlayIntentWindowBlockingAutoPrompt(
      new Date('2026-05-14T17:45:00.000Z'),
      new Date('2026-05-14T18:30:00.000Z'),
      now,
    ),
    true,
  )
})

test('blocks auto-prompt when the interested call to play starts within ten minutes', () => {
  const now = new Date('2026-05-14T18:00:00.000Z')

  assert.equal(
    isInterestedPlayIntentWindowBlockingAutoPrompt(
      new Date('2026-05-14T18:10:00.000Z'),
      new Date('2026-05-14T19:00:00.000Z'),
      now,
    ),
    true,
  )
})

test('does not block auto-prompt when the interested call to play starts after the lead window', () => {
  const now = new Date('2026-05-14T18:00:00.000Z')

  assert.equal(
    isInterestedPlayIntentWindowBlockingAutoPrompt(
      new Date('2026-05-14T18:11:00.000Z'),
      new Date('2026-05-14T19:00:00.000Z'),
      now,
    ),
    false,
  )
})

test('does not block auto-prompt when the interested call to play already ended', () => {
  const now = new Date('2026-05-14T18:00:00.000Z')

  assert.equal(
    isInterestedPlayIntentWindowBlockingAutoPrompt(
      new Date('2026-05-14T17:30:00.000Z'),
      new Date('2026-05-14T18:00:00.000Z'),
      now,
    ),
    false,
  )
})
