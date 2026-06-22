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

// ---------------------------------------------------------------------------
// Running late
// ---------------------------------------------------------------------------

test('creator running-late notification describes the late interested player', () => {
  const notification = formatCreatorRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorRunningLateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested but running late for Helldivers 2.')
  assert.equal(notification.discordBody, '<@123> is interested but running late for Helldivers 2.')
})

test('creator running-late notification falls back to the call when no game is set', () => {
  const notification = formatCreatorRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested but running late for your call to play.')
  assert.equal(notification.body, notification.discordBody)
})

test('audience running-late notification points at this call for other interested players', () => {
  const notification = formatAudienceRunningLateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: null
  })

  assert.equal(notification.title, audienceRunningLateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested but running late for this call to play.')
  assert.equal(notification.discordBody, '<@123> is interested but running late for this call to play.')
})

test('getPlayIntentSystemNotificationDefinitionByTitle returns null for an unknown title', () => {
  assert.equal(getPlayIntentSystemNotificationDefinitionByTitle('not a real title'), null)
})

// ---------------------------------------------------------------------------
// Creator interest update / withdrawn
// ---------------------------------------------------------------------------

test('creator interest update notification renders the configured title and body', () => {
  const notification = formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorInterestUpdateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested in playing Helldivers 2.')
  assert.equal(notification.discordBody, '<@123> is interested in playing Helldivers 2.')
})

test('creator interest update notification falls back when no game title is provided', () => {
  const notification = formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested in your call to play.')
  assert.equal(notification.discordBody, '<@123> is interested in your call to play.')
})

test('creator interest withdrawn notification renders the configured title and body', () => {
  const notification = formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorInterestWithdrawnSystemNotification.title)
  assert.equal(notification.body, 'Sam passed on Helldivers 2.')
  assert.equal(notification.discordBody, '<@123> passed on Helldivers 2.')
})

test('creator interest withdrawn notification falls back when no game title is provided', () => {
  const notification = formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: 'Sam',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam passed on your call to play.')
  // No recipientLabel → discordBody falls back to the display name.
  assert.equal(notification.discordBody, 'Sam passed on your call to play.')
})

test('audience interest update notification renders the configured title and body', () => {
  const notification = formatAudienceInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, audienceInterestUpdateSystemNotification.title)
  assert.equal(notification.body, 'Sam is interested in playing Helldivers 2.')
  assert.equal(notification.discordBody, '<@123> is interested in playing Helldivers 2.')
})

test('audience interest update notification falls back when no game title is provided', () => {
  const notification = formatAudienceInterestUpdateSystemNotification({
    recipientDisplayName: 'Sam',
    recipientLabel: '<@123>',
    gameTitle: null
  })

  assert.equal(notification.body, 'Sam is interested in this call to play.')
  assert.equal(notification.discordBody, '<@123> is interested in this call to play.')
})

// ---------------------------------------------------------------------------
// Game launched
// ---------------------------------------------------------------------------

test('creator launched game notification audience copy targets interested players', () => {
  const notification = formatCreatorLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    actorLabel: '<@456>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, creatorLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for the active call to play you are interested in.')
  assert.equal(notification.discordBody, '<@456> just launched Helldivers 2 for the active call to play you are interested in.')
})

test('group launched game notification audience copy targets the call to play group', () => {
  const notification = formatGroupLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    actorLabel: '<@456>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, groupLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for this call to play.')
  assert.equal(notification.discordBody, '<@456> just launched Helldivers 2 for this call to play.')
})

test('interested-player launched game notification audience copy targets the creator', () => {
  const notification = formatInterestedPlayerLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    actorLabel: '<@456>',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.title, interestedPlayerLaunchedGameSystemNotification.title)
  assert.equal(notification.body, 'Ryan just launched Helldivers 2 for your active call to play.')
  assert.equal(notification.discordBody, '<@456> just launched Helldivers 2 for your active call to play.')
})

test('launched game notifications fall back to the display name when no actor label is provided', () => {
  const notification = formatGroupLaunchedGameSystemNotification({
    actorDisplayName: 'Ryan',
    gameTitle: 'Helldivers 2'
  })

  assert.equal(notification.body, notification.discordBody)
  assert.match(notification.discordBody, /^Ryan just launched/)
})

// ---------------------------------------------------------------------------
// Voice channel joined
// ---------------------------------------------------------------------------

test('voice channel join notification names the channel when provided', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam',
    actorLabel: '<@123>',
    voiceChannelName: 'squad-up'
  })

  assert.equal(notification.title, voiceChannelJoinedSystemNotification.title)
  assert.equal(notification.body, 'Sam just joined the voice channel squad-up for this call to play.')
  assert.equal(notification.discordBody, '<@123> just joined the voice channel squad-up for this call to play.')
})

test('voice channel join notification omits the channel name when missing', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam',
    actorLabel: '<@123>',
    voiceChannelName: null
  })

  assert.equal(notification.body, 'Sam just joined the voice channel for this call to play.')
  assert.equal(notification.discordBody, '<@123> just joined the voice channel for this call to play.')
})

test('voice channel join notification falls back to the display name when no actor label is provided', () => {
  const notification = formatVoiceChannelJoinedSystemNotification({
    actorDisplayName: 'Sam'
  })

  assert.equal(notification.body, notification.discordBody)
})
