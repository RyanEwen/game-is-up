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
    playIntentIsActive: true,
    renderSurface: 'response'
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

test('audience notification surface stays on the prompt branch after interest while active', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.FRIEND_PLAYING,
    responseChoice: NotificationResponseChoice.JOIN,
    playIntentIsActive: true,
    renderSurface: 'notification'
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'prompt'
  })
})

test('audience response surface still resolves to joined after interest while active', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    responseChoice: NotificationResponseChoice.JOIN,
    playIntentIsActive: true,
    renderSurface: 'response'
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'joined'
  })
})

test('inactive audience response surface resolves to expired even after interest', () => {
  const state = resolveNotificationDirectMessageRenderState({
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    responseChoice: NotificationResponseChoice.JOIN,
    playIntentIsActive: false,
    renderSurface: 'response'
  })

  assert.deepEqual(state, {
    kind: 'audience-play-intent',
    variant: 'expired'
  })
})