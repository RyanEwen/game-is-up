import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatCreatorInterestUpdateSystemNotification,
  formatCreatorInterestWithdrawnSystemNotification
} from './play-intent-system-notifications.js'

test('creator interest update notifications use the check emoji heading', () => {
  const notification = formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '@Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, '✅ Someone is interested')
})

test('creator pass notifications use the cross-mark emoji heading', () => {
  const notification = formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '@Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, '❎ Someone passed')
})