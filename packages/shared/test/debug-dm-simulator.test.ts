import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSimulatedDmMessages } from '../src/debug-dm-simulator.js'
import { buildSimulatedCallToPlayMessagesForHistory } from '../src/debug-dm-simulator-history.js'
import { applySimulatorLifecycleAction, buildInitialSimulatorDialogState } from '../src/debug-dm-simulator-state.js'

const draft = {
  creatorName: 'Ryan',
  audienceName: 'Sam',
  gameTitle: 'Helldivers 2',
  scheduledForLabel: 'Tonight',
  note: 'Drop in if you are around.'
} as const

test('go-time follow-up replies stay non-interactive while the invite anchor remains actionable', () => {
  const { audienceMessages } = buildSimulatedDmMessages(draft, {
    stage: 'confirmed',
    audienceResponse: 'interested',
    creatorCheckInState: 'confirmed',
    hasGoTimeBroadcast: true,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1
  })

  const inviteAnchor = audienceMessages.find((message) => message.id === 'audience-anchor')
  const followUp = audienceMessages.find((message) => message.id === 'audience-follow-up')

  assert.ok(inviteAnchor)
  assert.equal(inviteAnchor.isInteractive, true)
  assert.ok(inviteAnchor.preview.buttonRows.length > 0)

  assert.ok(followUp)
  assert.equal(followUp.isInteractive, false)
  assert.deepEqual(followUp.preview.buttonRows, [])
  assert.match(followUp.preview.content, /^⏰ Go Time/m)
  assert.match(followUp.preview.content, /See original invite above for details or to change your response\./)
})

test('go-time reminder replies use the original-invite guidance copy', () => {
  const { audienceMessages } = buildSimulatedDmMessages(draft, {
    stage: 'confirmed',
    audienceResponse: null,
    creatorCheckInState: 'confirmed',
    hasGoTimeBroadcast: true,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1
  })

  const followUp = audienceMessages.find((message) => message.id === 'audience-follow-up')

  assert.ok(followUp)
  assert.equal(followUp.isInteractive, false)
  assert.deepEqual(followUp.preview.buttonRows, [])
  assert.match(followUp.preview.content, /^⏰ Go Time/m)
  assert.match(followUp.preview.content, /See original invite above for details or to change your response\./)
  assert.doesNotMatch(followUp.preview.content, /Use the buttons below if you want in\./)
})

test('creator follow-up previews use the requested audience-status emoji headings', () => {
  const interestedMessages = buildSimulatedDmMessages(draft, {
    stage: 'scheduled',
    audienceResponse: 'interested',
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1
  }).creatorMessages

  const passedMessages = buildSimulatedDmMessages(draft, {
    stage: 'scheduled',
    audienceResponse: 'pass',
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1
  }).creatorMessages

  const interestedFollowUp = interestedMessages.find((message) => message.id === 'creator-follow-up')
  const passedFollowUp = passedMessages.find((message) => message.id === 'creator-follow-up')

  assert.ok(interestedFollowUp)
  assert.match(interestedFollowUp.preview.content, /^✅ Someone is interested/m)

  assert.ok(passedFollowUp)
  assert.match(passedFollowUp.preview.content, /^❎ Someone passed/m)
})

test('audience pass follow-up previews use the cross-mark emoji heading', () => {
  const { audienceMessages } = buildSimulatedDmMessages(draft, {
    stage: 'confirmed',
    audienceResponse: 'pass',
    creatorCheckInState: 'confirmed',
    hasGoTimeBroadcast: true,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1
  })

  const followUp = audienceMessages.find((message) => message.id === 'audience-follow-up')

  assert.ok(followUp)
  assert.match(followUp.preview.content, /^❎ Passed for Now/m)
  assert.match(followUp.preview.content, /You are marked as passing for now\. Passing is anonymous\./)
  assert.doesNotMatch(followUp.preview.content, /Ryan has been notified\./)
})

test('creator live activity events add dangling replies to the audience thread in the simulator', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })
  const interestedState = applySimulatorLifecycleAction(initialState, 'audience-interested', draft)
  const voiceState = applySimulatorLifecycleAction(interestedState, 'creator-joined-voice', draft)
  const launchState = applySimulatorLifecycleAction(voiceState, 'creator-launched-game', draft)
  const { audienceMessages } = buildSimulatedCallToPlayMessagesForHistory([...launchState.history].reverse())

  const voiceReply = audienceMessages.find((message) => message.id === 'audience-activity-3')
  const launchReply = audienceMessages.find((message) => message.id === 'audience-activity-4')

  assert.ok(voiceReply)
  assert.match(voiceReply.preview.content, /^🎙 Someone joined the voice channel/m)
  assert.match(voiceReply.preview.content, /@Ryan just joined the voice channel/m)

  assert.ok(launchReply)
  assert.match(launchReply.preview.content, /^🎮 Someone launched the game/m)
  assert.match(launchReply.preview.content, /@Ryan just launched Helldivers 2/m)
})

test('audience live activity events add dangling replies to the creator thread in the simulator', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })
  const interestedState = applySimulatorLifecycleAction(initialState, 'audience-interested', draft)
  const voiceState = applySimulatorLifecycleAction(interestedState, 'audience-joined-voice', draft)
  const launchState = applySimulatorLifecycleAction(voiceState, 'audience-launched-game', draft)
  const { creatorMessages } = buildSimulatedCallToPlayMessagesForHistory([...launchState.history].reverse())

  const voiceReply = creatorMessages.find((message) => message.id === 'creator-activity-3')
  const launchReply = creatorMessages.find((message) => message.id === 'creator-activity-4')

  assert.ok(voiceReply)
  assert.match(voiceReply.preview.content, /^🎙 Someone joined the voice channel/m)
  assert.match(voiceReply.preview.content, /@Sam just joined the voice channel/m)

  assert.ok(launchReply)
  assert.match(launchReply.preview.content, /^🎮 Someone launched the game/m)
  assert.match(launchReply.preview.content, /@Sam just launched Helldivers 2/m)
})

test('simulator ignores repeated voice activity triggers after the first one', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })

  const interestedState = applySimulatorLifecycleAction(initialState, 'audience-interested', draft)
  const firstVoiceState = applySimulatorLifecycleAction(interestedState, 'creator-joined-voice', draft)
  const repeatedVoiceState = applySimulatorLifecycleAction(firstVoiceState, 'audience-joined-voice', draft)

  assert.equal(firstVoiceState.hasVoiceChannelActivity, true)
  assert.equal(repeatedVoiceState, firstVoiceState)
})

test('simulator ignores creator voice activity until the audience is interested', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })

  const voiceState = applySimulatorLifecycleAction(initialState, 'creator-joined-voice', draft)

  assert.equal(voiceState, initialState)
})

test('simulator ignores repeated game launch triggers after the first one', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })

  const interestedState = applySimulatorLifecycleAction(initialState, 'audience-interested', draft)
  const firstLaunchState = applySimulatorLifecycleAction(interestedState, 'creator-launched-game', draft)
  const repeatedLaunchState = applySimulatorLifecycleAction(firstLaunchState, 'audience-launched-game', draft)

  assert.equal(firstLaunchState.hasGameLaunchActivity, true)
  assert.equal(repeatedLaunchState, firstLaunchState)
})

test('simulator ignores creator game launch activity until the audience is interested', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live'
  })

  const launchState = applySimulatorLifecycleAction(initialState, 'creator-launched-game', draft)

  assert.equal(launchState, initialState)
})