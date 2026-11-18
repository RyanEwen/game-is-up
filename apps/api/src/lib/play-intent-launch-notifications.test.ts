import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlayIntentActivityDeduplicationKey,
  resolvePlayIntentActivityRecipientUserIds,
} from './play-intent-launch-notifications.js'

test('creator activity notifies every invited recipient who has not passed', () => {
  assert.deepEqual(
    resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: 'creator-1',
      triggeredByUserId: 'creator-1',
      declinedUserIds: ['audience-3'],
      audienceRecipientUserIds: ['audience-1', 'audience-2', 'audience-3'],
    }),
    ['audience-1', 'audience-2'],
  )
})

test('audience activity notifies the creator plus other non-passed recipients', () => {
  assert.deepEqual(
    resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: 'creator-1',
      triggeredByUserId: 'audience-3',
      declinedUserIds: [],
      audienceRecipientUserIds: ['audience-1', 'audience-2', 'audience-3'],
    }),
    ['creator-1', 'audience-1', 'audience-2'],
  )
})

test('not-yet-responded recipients still receive creator activity notifications', () => {
  assert.deepEqual(
    resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: 'creator-1',
      triggeredByUserId: 'creator-1',
      declinedUserIds: [],
      audienceRecipientUserIds: ['audience-1', 'audience-2'],
    }),
    ['audience-1', 'audience-2'],
  )
})

test('recipients who passed receive no activity notifications', () => {
  assert.deepEqual(
    resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: 'creator-1',
      triggeredByUserId: 'creator-1',
      declinedUserIds: ['audience-1', 'audience-2'],
      audienceRecipientUserIds: ['audience-1', 'audience-2'],
    }),
    [],
  )
})

test('non-participants do not trigger play intent activity notifications', () => {
  assert.deepEqual(
    resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: 'creator-1',
      triggeredByUserId: 'outsider-1',
      declinedUserIds: [],
      audienceRecipientUserIds: ['audience-1', 'audience-2'],
    }),
    [],
  )
})

test('activity deduplication keys ignore which user triggered the first live signal', () => {
  assert.equal(
    buildPlayIntentActivityDeduplicationKey({
      playIntentId: 'play-intent-1',
      title: '🎙 Someone joined the voice channel',
      gameId: null,
    }),
    buildPlayIntentActivityDeduplicationKey({
      playIntentId: 'play-intent-1',
      title: '🎙 Someone joined the voice channel',
      gameId: null,
    }),
  )
})
