import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isCreatorPlayIntentSummaryCustomId,
  isPlayIntentMuteCustomId,
  isPlayIntentNotificationCustomId,
  isScheduledPlayIntentCheckInCustomId
} from './play-intent-notification-responses.js'

test('isPlayIntentNotificationCustomId matches the response and mute prefixes', () => {
  // Matches both the response prefix used for interested/pass and the mute
  // prefix because the routing layer dispatches both through the same handler.
  assert.equal(isPlayIntentNotificationCustomId('play-intent-response:notif-1:interested'), true)
  assert.equal(isPlayIntentNotificationCustomId('play-intent-response:notif-1:pass'), true)
  assert.equal(isPlayIntentNotificationCustomId('play-intent-response:notif-1:cleanup'), true)
  assert.equal(isPlayIntentNotificationCustomId('play-intent-mute:user-1'), true)
})

test('isPlayIntentNotificationCustomId rejects unrelated prefixes', () => {
  assert.equal(isPlayIntentNotificationCustomId('scheduled-play-intent-check-in:notif-1:confirm'), false)
  assert.equal(isPlayIntentNotificationCustomId('creator-play-intent-summary:intent-1:end'), false)
  assert.equal(isPlayIntentNotificationCustomId('auto-play:prompt-1:cleanup'), false)
  assert.equal(isPlayIntentNotificationCustomId(''), false)
})

test('isPlayIntentMuteCustomId only matches the mute prefix', () => {
  assert.equal(isPlayIntentMuteCustomId('play-intent-mute:user-1'), true)
  assert.equal(isPlayIntentMuteCustomId('play-intent-response:notif-1:pass'), false)
  assert.equal(isPlayIntentMuteCustomId('creator-play-intent-summary:intent-1:end'), false)
})

test('isScheduledPlayIntentCheckInCustomId only matches the check-in prefix', () => {
  assert.equal(isScheduledPlayIntentCheckInCustomId('scheduled-play-intent-check-in:notif-1:confirm'), true)
  assert.equal(isScheduledPlayIntentCheckInCustomId('scheduled-play-intent-check-in:notif-1:end'), true)
  assert.equal(isScheduledPlayIntentCheckInCustomId('play-intent-response:notif-1:interested'), false)
  assert.equal(isScheduledPlayIntentCheckInCustomId('creator-play-intent-summary:intent-1:cleanup'), false)
})

test('isCreatorPlayIntentSummaryCustomId only matches the creator-summary prefix', () => {
  assert.equal(isCreatorPlayIntentSummaryCustomId('creator-play-intent-summary:intent-1:end'), true)
  assert.equal(isCreatorPlayIntentSummaryCustomId('creator-play-intent-summary:intent-1:start-now'), true)
  assert.equal(isCreatorPlayIntentSummaryCustomId('creator-play-intent-summary:intent-1:cleanup'), true)
  assert.equal(isCreatorPlayIntentSummaryCustomId('creator-play-intent-summary:intent-1:delete-space'), true)
  assert.equal(isCreatorPlayIntentSummaryCustomId('play-intent-response:notif-1:interested'), false)
  assert.equal(isCreatorPlayIntentSummaryCustomId('play-intent-mute:user-1'), false)
})
