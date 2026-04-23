import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlayIntentUpdatedFieldsSummary,
  resolvePlayIntentUpdatedFields,
  shouldInvalidatePlayIntentAudienceResponse
} from '../src/play-intent-update-effects.js'

// ---------------------------------------------------------------------------
// shouldInvalidatePlayIntentAudienceResponse
// ---------------------------------------------------------------------------

test('note-only updates preserve existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['note']), false)
})

test('audience-only updates preserve existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['audience']), false)
})

test('temporary-Discord-channel-only updates preserve existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['temporary Discord channel']), false)
})

test('time updates invalidate existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['time']), true)
})

test('game-selection updates invalidate existing audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['game selection']), true)
})

test('mixed updates invalidate audience responses when time or game selection changed', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['note', 'time']), true)
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['note', 'audience', 'game selection']), true)
})

test('an empty updated-field list does not invalidate audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse([]), false)
})

test('unknown updated fields do not invalidate audience responses', () => {
  assert.equal(shouldInvalidatePlayIntentAudienceResponse(['something else']), false)
})

// ---------------------------------------------------------------------------
// resolvePlayIntentUpdatedFields
// ---------------------------------------------------------------------------

test('resolvePlayIntentUpdatedFields returns no fields when comparisons are equal', () => {
  assert.deepEqual(resolvePlayIntentUpdatedFields({}, {}), [])
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { timeKey: 'a', note: 'n', audienceKey: ['x'], gameSelectionKey: ['g'], hasTemporaryDiscordChannel: true },
      { timeKey: 'a', note: 'n', audienceKey: ['x'], gameSelectionKey: ['g'], hasTemporaryDiscordChannel: true }
    ),
    []
  )
})

test('resolvePlayIntentUpdatedFields treats null/undefined/empty-string note values as equivalent', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields({ note: null }, { note: '' }),
    []
  )
  assert.deepEqual(
    resolvePlayIntentUpdatedFields({ note: undefined }, { note: '   ' }),
    []
  )
})

test('resolvePlayIntentUpdatedFields trims note before comparing', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields({ note: 'hello' }, { note: '  hello  ' }),
    []
  )
  assert.deepEqual(
    resolvePlayIntentUpdatedFields({ note: 'hello' }, { note: 'hello world' }),
    ['note']
  )
})

test('resolvePlayIntentUpdatedFields ignores audience ordering and duplicates', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { audienceKey: ['user-b', 'user-a'] },
      { audienceKey: ['user-a', 'user-b', 'user-a'] }
    ),
    []
  )
})

test('resolvePlayIntentUpdatedFields detects audience changes after dedup and trim', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { audienceKey: ['user-a'] },
      { audienceKey: ['user-a', 'user-b'] }
    ),
    ['audience']
  )
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { audienceKey: ['user-a', '  '] },
      { audienceKey: ['user-a'] }
    ),
    []
  )
})

test('resolvePlayIntentUpdatedFields ignores game-selection ordering and duplicates', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { gameSelectionKey: ['game-b', 'game-a'] },
      { gameSelectionKey: ['game-a', 'game-b'] }
    ),
    []
  )
})

test('resolvePlayIntentUpdatedFields treats temporary Discord channel toggles as a change', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { hasTemporaryDiscordChannel: false },
      { hasTemporaryDiscordChannel: true }
    ),
    ['temporary Discord channel']
  )
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { hasTemporaryDiscordChannel: null },
      { hasTemporaryDiscordChannel: false }
    ),
    []
  )
})

test('resolvePlayIntentUpdatedFields preserves the canonical field ordering', () => {
  assert.deepEqual(
    resolvePlayIntentUpdatedFields(
      { timeKey: 'a', gameSelectionKey: ['x'], note: '1', audienceKey: ['p'], hasTemporaryDiscordChannel: false },
      { timeKey: 'b', gameSelectionKey: ['y'], note: '2', audienceKey: ['q'], hasTemporaryDiscordChannel: true }
    ),
    ['time', 'game selection', 'note', 'audience', 'temporary Discord channel']
  )
})

// ---------------------------------------------------------------------------
// buildPlayIntentUpdatedFieldsSummary
// ---------------------------------------------------------------------------

test('buildPlayIntentUpdatedFieldsSummary uses the generic phrasing when no fields changed', () => {
  assert.equal(
    buildPlayIntentUpdatedFieldsSummary([]),
    'Updated the call to play details.'
  )
})

test('buildPlayIntentUpdatedFieldsSummary lists changed fields in the provided order', () => {
  assert.equal(
    buildPlayIntentUpdatedFieldsSummary(['time']),
    'Updated the call to play: time changed.'
  )
  assert.equal(
    buildPlayIntentUpdatedFieldsSummary(['time', 'game selection']),
    'Updated the call to play: time, game selection changed.'
  )
})
