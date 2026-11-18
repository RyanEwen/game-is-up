import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlayIntentNotificationCopy } from './play-intents.js'

test('scheduled selected-game notification titles include the localized start time', () => {
  const copy = buildPlayIntentNotificationCopy(
    'Ryan',
    'subset',
    ['Helldivers 2'],
    120,
    new Date('2026-04-01T20:30:00.000Z'),
    new Date('2026-04-01T19:00:00.000Z'),
    'Etc/UTC',
  )

  assert.equal(copy.title, 'Ryan scheduled Helldivers 2 at 8:30pm')
})

test('right-now selected-game notification titles call out immediate timing', () => {
  const copy = buildPlayIntentNotificationCopy(
    'Ryan',
    'subset',
    ['Helldivers 2'],
    120,
    new Date('2026-04-01T20:00:00.000Z'),
    new Date('2026-04-01T20:00:00.000Z'),
    'Etc/UTC',
  )

  assert.equal(copy.title, 'Ryan wants to play Helldivers 2 (right now!)')
  assert.equal(copy.body, 'When: For 2 hours starting now.')
})
