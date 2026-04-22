import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice, PlayIntentScope } from '@prisma/client'

import { resolveRecipientResponseTransition } from './play-intent-recipient-response-transition.js'

test('initial targeted pass notifies the creator', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: null,
    response: 'DECLINE',
    scope: PlayIntentScope.SPECIFIC_FRIENDS
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldCreateCreatorSystemNotification: true,
    acknowledgementKind: 'pass-initial'
  })
})

test('pass after join notifies the creator even outside targeted scope', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.JOIN,
    response: 'DECLINE',
    scope: PlayIntentScope.FRIENDS_ONLY
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldCreateCreatorSystemNotification: true,
    acknowledgementKind: 'pass-from-join'
  })
})

test('repeat pass stays quiet and keeps the repeat acknowledgement', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.DECLINE,
    response: 'DECLINE',
    scope: PlayIntentScope.FRIENDS_ONLY
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldCreateCreatorSystemNotification: false,
    acknowledgementKind: 'pass-repeat'
  })
})

test('initial join notifies the creator', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: null,
    response: 'JOIN',
    scope: PlayIntentScope.FRIENDS_ONLY
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldCreateCreatorSystemNotification: true,
    acknowledgementKind: 'interested'
  })
})

test('repeat join does not notify the creator again', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.JOIN,
    response: 'JOIN',
    scope: PlayIntentScope.FRIENDS_ONLY
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldCreateCreatorSystemNotification: false,
    acknowledgementKind: 'interested'
  })
})