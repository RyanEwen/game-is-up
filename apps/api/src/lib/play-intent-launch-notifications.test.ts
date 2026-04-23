import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlayIntentActivityDeduplicationKey,
  resolvePlayIntentActivityRecipientUserIds
} from './play-intent-launch-notifications.js'

test('creator activity notifies only interested audience members', () => {
  assert.deepEqual(resolvePlayIntentActivityRecipientUserIds({
    creatorUserId: 'creator-1',
    triggeredByUserId: 'creator-1',
    interestedUserIds: ['audience-1', 'audience-2'],
    audienceRecipientUserIds: ['audience-1', 'audience-2', 'audience-3']
  }), ['audience-1', 'audience-2'])
})

test('audience activity notifies the creator plus other interested audience members', () => {
  assert.deepEqual(resolvePlayIntentActivityRecipientUserIds({
    creatorUserId: 'creator-1',
    triggeredByUserId: 'audience-3',
    interestedUserIds: ['audience-1', 'audience-2'],
    audienceRecipientUserIds: ['audience-1', 'audience-2', 'audience-3']
  }), ['creator-1', 'audience-1', 'audience-2'])
})

test('uninterested audience does not receive creator activity notifications', () => {
  assert.deepEqual(resolvePlayIntentActivityRecipientUserIds({
    creatorUserId: 'creator-1',
    triggeredByUserId: 'creator-1',
    interestedUserIds: [],
    audienceRecipientUserIds: ['audience-1', 'audience-2']
  }), [])
})

test('non-participants do not trigger play intent activity notifications', () => {
  assert.deepEqual(resolvePlayIntentActivityRecipientUserIds({
    creatorUserId: 'creator-1',
    triggeredByUserId: 'outsider-1',
    interestedUserIds: ['audience-1'],
    audienceRecipientUserIds: ['audience-1', 'audience-2']
  }), [])
})

test('activity deduplication keys ignore which user triggered the first live signal', () => {
  assert.equal(
    buildPlayIntentActivityDeduplicationKey({
      playIntentId: 'play-intent-1',
      title: '🎙 Someone joined the voice channel',
      gameId: null
    }),
    buildPlayIntentActivityDeduplicationKey({
      playIntentId: 'play-intent-1',
      title: '🎙 Someone joined the voice channel',
      gameId: null
    })
  )
})