import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatGroupLaunchedGameSystemNotification,
  formatCreatorInterestUpdateSystemNotification,
  formatCreatorInterestWithdrawnSystemNotification,
  formatVoiceChannelJoinedSystemNotification
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

test('group game launch notifications use the controller emoji heading', () => {
  const notification = formatGroupLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    actorLabel: '@Ryan',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, '🎮 Someone launched the game')
  assert.match(notification.discordBody, /@Ryan just launched Helldivers 2/)
})

test('voice channel join notifications use the microphone emoji heading', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam',
    actorLabel: '@Sam',
    voiceChannelName: 'squad-up'
  })

  assert.equal(notification.title, '🎙 Someone joined the voice channel')
  assert.match(notification.discordBody, /@Sam just joined the voice channel squad-up/)
})