import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice } from '@prisma/client'

import { resolveRecipientResponseTransition } from './play-intent-recipient-response-transition.js'

test('an initial pass notifies on every audience scope', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: null,
    response: 'DECLINE',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldNotifyResponseChange: true,
    acknowledgementKind: 'pass-initial',
  })
})

test('pass after join notifies and reports the withdrawal acknowledgement', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.JOIN,
    response: 'DECLINE',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldNotifyResponseChange: true,
    acknowledgementKind: 'pass-from-join',
  })
})

test('repeat pass stays quiet and keeps the repeat acknowledgement', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.DECLINE,
    response: 'DECLINE',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.DECLINE,
    shouldNotifyResponseChange: false,
    acknowledgementKind: 'pass-repeat',
  })
})

test('initial join notifies', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: null,
    response: 'JOIN',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldNotifyResponseChange: true,
    acknowledgementKind: 'interested',
  })
})

test('join after pass notifies with a fresh DM', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.DECLINE,
    response: 'JOIN',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldNotifyResponseChange: true,
    acknowledgementKind: 'interested',
  })
})

test('repeat join does not notify again', () => {
  const transition = resolveRecipientResponseTransition({
    previousChoice: NotificationResponseChoice.JOIN,
    response: 'JOIN',
  })

  assert.deepEqual(transition, {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldNotifyResponseChange: false,
    acknowledgementKind: 'interested',
  })
})
