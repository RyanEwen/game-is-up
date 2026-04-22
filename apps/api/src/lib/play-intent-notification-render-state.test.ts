import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice, NotificationType } from '@prisma/client'

import { resolveNotificationDirectMessageRenderState } from './play-intent-notification-render-state.js'

test('scheduled check-in confirmed resolves to the confirmed render branch', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
    responseChoice: NotificationResponseChoice.CONFIRMED,
    playIntentIsActive: true
  })

  assert.deepEqual(state, {
    kind: 'scheduled-check-in',
    variant: 'confirmed'
  })
})

test('audience invite pass resolves to the declined render branch', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.FRIEND_PLAYING,
    responseChoice: NotificationResponseChoice.DECLINE,
    playIntentIsActive: true
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'declined'
  })
})

test('audience invite without response stays on the prompt branch while active', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
    responseChoice: null,
    playIntentIsActive: true
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'prompt'
  })
})

test('inactive audience invite resolves to the expired render branch', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    responseChoice: null,
    playIntentIsActive: false
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'expired'
  })
})