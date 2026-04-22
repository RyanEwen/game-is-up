import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldInvalidatePlayIntentAudienceResponse } from '../src/play-intent-update-effects.js'

test('note-only updates preserve existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['note']), false)
})

test('audience-only updates preserve existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['audience']), false)
})

test('time updates invalidate existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['time']), true)
})

test('game-selection updates invalidate existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['game selection']), true)
})

test('mixed updates invalidate audience responses when time or game selection changed', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['note', 'time']), true)
})