/** Unit tests for the UTC day used to bucket anonymous Discord activity counts. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { toUtcDay } from './discord-activity.js'

test('toUtcDay is the UTC calendar day, whatever the local time zone', () => {
  assert.equal(
    toUtcDay(new Date('2026-11-10T02:00:00Z')).toISOString(),
    '2026-11-10T00:00:00.000Z',
  )
  assert.equal(
    toUtcDay(new Date('2026-11-10T23:59:59.999Z')).toISOString(),
    '2026-11-10T00:00:00.000Z',
  )
  assert.equal(
    toUtcDay(new Date('2026-11-11T00:00:00Z')).toISOString(),
    '2026-11-11T00:00:00.000Z',
  )
})
