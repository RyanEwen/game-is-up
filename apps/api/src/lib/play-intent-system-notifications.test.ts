import assert from 'node:assert/strict'
import test from 'node:test'

import {
  audienceInterestUpdateSystemNotification,
  audienceRunningLateSystemNotification,
  callToPlayEndedSystemNotification,
  creatorInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification,
  creatorRunningLateSystemNotification,
  formatAudienceInterestUpdateSystemNotification,
  formatAudienceRunningLateSystemNotification,
  creatorLaunchedGameSystemNotification,
  formatCreatorInterestUpdateSystemNotification,
  formatCreatorInterestWithdrawnSystemNotification,
  formatCreatorRunningLateSystemNotification,
  formatCreatorLaunchedGameSystemNotification,
  formatGroupLaunchedGameSystemNotification,
  formatInterestedPlayerLaunchedGameSystemNotification,
  formatVoiceChannelJoinedSystemNotification,
  getPlayIntentSystemNotificationDefinitionByTitle,
  groupLaunchedGameSystemNotification,
  interestedPlayerLaunchedGameSystemNotification,
  voiceChannelJoinedSystemNotification
} from './play-intent-system-notifications.js'

// ---------------------------------------------------------------------------
// Definition lookup
// ---------------------------------------------------------------------------

test('getPlayIntentSystemNotificationDefinitionByTitle round-trips every known definition', () => {
  for (const definition of [
    callToPlayEndedSystemNotification,
    voiceChannelJoinedSystemNotification,
    groupLaunchedGameSystemNotification,
    creatorLaunchedGameSystemNotification,
    interestedPlayerLaunchedGameSystemNotification,
    creatorInterestUpdateSystemNotification,
    audienceInterestUpdateSystemNotification,
    creatorInterestWithdrawnSystemNotification,
    creatorRunningLateSystemNotification,
    audienceRunningLateSystemNotification
  ]) {
    assert.equal(getPlayIntentSystemNotificationDefinitionByTitle(definition.title), definition)
  }
})

test('getPlayIntentSystemNotificationDefinitionByTitle returns null for an unknown title', () => {
  assert.equal(getPlayIntentSystemNotificationDefinitionByTitle('not a real title'), null)
})

// ---------------------------------------------------------------------------
// Running late
// ---------------------------------------------------------------------------

test('creator running-late notification describes the late interested player in plain text', () => {
  const notification = formatCreatorRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorRunningLateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested but running late for Helldivers 2.')
})

test('creator running-late notification falls back to the call when no game is set', () => {
  const notification = formatCreatorRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested but running late for your call to play.')
})

test('audience running-late notification points at this call for other interested players', () => {
  const notification = formatAudienceRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.title, audienceRunningLateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested but running late for this call to play.')
})

// ---------------------------------------------------------------------------
// Creator interest update / withdrawn
// ---------------------------------------------------------------------------

test('creator interest update notification renders the configured title and body', () => {
  const notification = formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorInterestUpdateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested in playing Helldivers 2.')
})

test('creator interest update notification falls back when no game title is provided', () => {
  const notification = formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested in your call to play.')
})

test('creator interest withdrawn notification renders the configured title and body', () => {
  const notification = formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorInterestWithdrawnSystemNotification.title)
  assert.equal(notification.body, 'Sam passed on Helldivers 2.')
})

test('creator interest withdrawn notification falls back when no game title is provided', () => {
  const notification = formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam passed on your call to play.')
})

test('audience interest update notification renders the configured title and body', () => {
  const notification = formatAudienceInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, audienceInterestUpdateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested in playing Helldivers 2.')
})

test('audience interest update notification falls back when no game title is provided', () => {
  const notification = formatAudienceInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested in this call to play.')
})

// ---------------------------------------------------------------------------
// Game launched
// ---------------------------------------------------------------------------

test('creator launched game notification audience copy targets interested players', () => {
  const notification = formatCreatorLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for the active call to play you are interested in.')
})

test('group launched game notification audience copy targets the call to play group', () => {
  const notification = formatGroupLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, groupLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for this call to play.')
})

test('interested-player launched game notification audience copy targets the creator', () => {
  const notification = formatInterestedPlayerLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, interestedPlayerLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for your active call to play.')
})

// ---------------------------------------------------------------------------
// Voice channel joined
// ---------------------------------------------------------------------------

test('voice channel join notification names the channel when provided', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam',
    voiceChannelName: 'squad-up'
  })

  assert.equal(notification.title, voiceChannelJoinedSystemNotification.title)
  assert.equal(notification.body, 'Sam just joined the voice channel squad-up for this call to play.')
})

test('voice channel join notification omits the channel name when missing', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam',
    voiceChannelName: null
  })

  assert.equal(notification.body, 'Sam just joined the voice channel for this call to play.')
})

// ---------------------------------------------------------------------------
// Plain-text bodies (no Discord mentions)
// ---------------------------------------------------------------------------

test('system notification bodies never contain Discord mention markup', () => {
  const notifications = [
    formatCreatorInterestUpdateSystemNotification({ recipientDisplayName: 'Sam', gameTitle: 'Helldivers 2' }),
    formatCreatorInterestWithdrawnSystemNotification({ recipientDisplayName: 'Sam', gameTitle: null }),
    formatCreatorRunningLateSystemNotification({ recipientDisplayName: 'Sam', gameTitle: null }),
    formatAudienceInterestUpdateSystemNotification({ recipientDisplayName: 'Sam', gameTitle: null }),
    formatAudienceRunningLateSystemNotification({ recipientDisplayName: 'Sam', gameTitle: null }),
    formatVoiceChannelJoinedSystemNotification({ actorDisplayName: 'Sam' }),
    formatGroupLaunchedGameSystemNotification({ actorDisplayName: 'Ryan', gameTitle: 'Helldivers 2' })
  ]

  for (const notification of notifications) {
    assert.doesNotMatch(notification.body, /<@\d*/)
  }
})
