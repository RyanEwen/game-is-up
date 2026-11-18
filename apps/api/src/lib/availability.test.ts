import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAvailability } from './availability.js'

test('game-specific availability takes priority over the profile default', () => {
  const result = resolveAvailability('Tonight after 9pm', 'Weekends')

  assert.deepEqual(result, {
    availability: 'Tonight after 9pm',
    availabilitySource: 'game-specific',
  })
})

test('falls back to the profile default when game availability is empty', () => {
  const result = resolveAvailability(null, 'Weekends')

  assert.deepEqual(result, {
    availability: 'Weekends',
    availabilitySource: 'profile-default',
  })
})

test('whitespace-only inputs are treated as missing', () => {
  const result = resolveAvailability('   ', '\t\n')

  assert.deepEqual(result, {
    availability: null,
    availabilitySource: null,
  })
})

test('trims surrounding whitespace from the resolved value', () => {
  const result = resolveAvailability('  Tonight  ', null)

  assert.deepEqual(result, {
    availability: 'Tonight',
    availabilitySource: 'game-specific',
  })
})

test('returns null source when both inputs are null', () => {
  const result = resolveAvailability(null, null)

  assert.deepEqual(result, {
    availability: null,
    availabilitySource: null,
  })
})
