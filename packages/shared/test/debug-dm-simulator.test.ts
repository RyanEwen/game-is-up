import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSimulatedDmMessages,
  simulatedDmActionIds,
} from '../src/debug-dm-simulator.js'
import { buildSimulatedCallToPlayMessagesForHistory } from '../src/debug-dm-simulator-history.js'
import {
  applySimulatorLifecycleAction,
  applySimulatorPreviewAction,
  buildInitialSimulatorDialogState,
} from '../src/debug-dm-simulator-state.js'

const draft = {
  creatorName: 'Ryan',
  audienceName: 'Sam',
  gameTitle: 'Helldivers 2',
  scheduledForLabel: 'Tonight',
  note: 'Drop in if you are around.',
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
    nextEntryId: 1,
  })

  const inviteAnchor = audienceMessages.find(
    (message) => message.id === 'audience-anchor',
  )
  const followUp = audienceMessages.find(
    (message) => message.id === 'audience-follow-up',
  )

  assert.ok(inviteAnchor)
  assert.equal(inviteAnchor.isInteractive, true)
  assert.ok(inviteAnchor.preview.buttonRows.length > 0)

  assert.ok(followUp)
  assert.equal(followUp.isInteractive, false)
  assert.deepEqual(followUp.preview.buttonRows, [])
  assert.match(followUp.preview.content, /^⏰ Go Time/m)
  assert.match(
    followUp.preview.content,
    /See original invite above for details or to change your response\./,
  )
})

test('audience invite previews include scheduled and right-now timing in the heading', () => {
  const scheduledInvite = buildSimulatedDmMessages(draft, {
    stage: 'scheduled',
    audienceResponse: null,
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1,
  }).audienceMessages.find((message) => message.id === 'audience-anchor')

  const immediateInvite = buildSimulatedDmMessages(draft, {
    stage: 'confirmed',
    audienceResponse: null,
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [],
    nextEntryId: 1,
  }).audienceMessages.find((message) => message.id === 'audience-anchor')

  assert.ok(scheduledInvite)
  assert.match(
    scheduledInvite.preview.content,
    /^🎮 Ryan scheduled Helldivers 2 Tonight$/m,
  )

  assert.ok(immediateInvite)
  assert.match(
    immediateInvite.preview.content,
    /^🎮 Ryan wants to play Helldivers 2 \(right now!\)$/m,
  )
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
    nextEntryId: 1,
  })

  const followUp = audienceMessages.find(
    (message) => message.id === 'audience-follow-up',
  )

  assert.ok(followUp)
  assert.equal(followUp.isInteractive, false)
  assert.deepEqual(followUp.preview.buttonRows, [])
  assert.match(followUp.preview.content, /^⏰ Go Time/m)
  assert.match(
    followUp.preview.content,
    /See original invite above for details or to change your response\./,
  )
  assert.doesNotMatch(
    followUp.preview.content,
    /Use the buttons below if you want in\./,
  )
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
    nextEntryId: 1,
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
    nextEntryId: 1,
  }).creatorMessages

  const interestedFollowUp = interestedMessages.find(
    (message) => message.id === 'creator-follow-up',
  )
  const passedFollowUp = passedMessages.find(
    (message) => message.id === 'creator-follow-up',
  )

  assert.ok(interestedFollowUp)
  assert.match(interestedFollowUp.preview.content, /^✅ Someone is interested/m)

  assert.ok(passedFollowUp)
  assert.match(passedFollowUp.preview.content, /^❌ Someone can't make it/m)
})

test('passing no longer posts a separate audience acknowledgement reply', () => {
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
    nextEntryId: 1,
  })

  const followUp = audienceMessages.find(
    (message) => message.id === 'audience-follow-up',
  )

  assert.equal(followUp, undefined)
})

test('creator live activity events add dangling replies to the audience thread in the simulator', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })
  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const voiceState = applySimulatorLifecycleAction(
    interestedState,
    'creator-joined-voice',
    draft,
  )
  const launchState = applySimulatorLifecycleAction(
    voiceState,
    'creator-launched-game',
    draft,
  )
  const { audienceMessages } = buildSimulatedCallToPlayMessagesForHistory(
    [...launchState.history].reverse(),
  )

  const voiceReply = audienceMessages.find(
    (message) => message.id === 'audience-activity-3',
  )
  const launchReply = audienceMessages.find(
    (message) => message.id === 'audience-activity-4',
  )

  assert.ok(voiceReply)
  assert.match(
    voiceReply.preview.content,
    /^🎙 Someone joined the voice channel/m,
  )
  assert.match(
    voiceReply.preview.content,
    /@Ryan just joined the voice channel/m,
  )

  assert.ok(launchReply)
  assert.match(launchReply.preview.content, /^🎮 Someone launched the game/m)
  assert.match(launchReply.preview.content, /@Ryan just launched Helldivers 2/m)
})

test('audience live activity events add dangling replies to the creator thread in the simulator', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })
  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const voiceState = applySimulatorLifecycleAction(
    interestedState,
    'audience-joined-voice',
    draft,
  )
  const launchState = applySimulatorLifecycleAction(
    voiceState,
    'audience-launched-game',
    draft,
  )
  const { creatorMessages } = buildSimulatedCallToPlayMessagesForHistory(
    [...launchState.history].reverse(),
  )

  const voiceReply = creatorMessages.find(
    (message) => message.id === 'creator-activity-3',
  )
  const launchReply = creatorMessages.find(
    (message) => message.id === 'creator-activity-4',
  )

  assert.ok(voiceReply)
  assert.match(
    voiceReply.preview.content,
    /^🎙 Someone joined the voice channel/m,
  )
  assert.match(
    voiceReply.preview.content,
    /@Sam just joined the voice channel/m,
  )

  assert.ok(launchReply)
  assert.match(launchReply.preview.content, /^🎮 Someone launched the game/m)
  assert.match(launchReply.preview.content, /@Sam just launched Helldivers 2/m)
})

test('audience running-late flags the interested player and notifies both threads', () => {
  const initialState = buildInitialSimulatorDialogState({ draft, mode: 'live' })
  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const lateState = applySimulatorLifecycleAction(
    interestedState,
    'audience-running-late',
    draft,
  )

  assert.equal(lateState.audienceRunningLate, true)
  assert.equal(lateState.audienceResponse, 'interested')

  const { creatorMessages, audienceMessages } = buildSimulatedDmMessages(
    draft,
    lateState,
  )
  const creatorFollowUp = creatorMessages.find(
    (message) => message.id === 'creator-follow-up',
  )
  const audienceFollowUp = audienceMessages.find(
    (message) => message.id === 'audience-follow-up',
  )

  assert.ok(creatorFollowUp)
  assert.match(creatorFollowUp.preview.content, /^⏰ Someone is running late/m)
  assert.match(
    creatorFollowUp.preview.content,
    /@Sam is interested but running late for Helldivers 2\./,
  )

  // Running late no longer posts a separate audience acknowledgement reply; the
  // invite anchor updates in place instead.
  assert.equal(audienceFollowUp, undefined)
})

test('the simulated invite prompt offers "I\'ll be late" once interested and clicking it flags late', () => {
  const initialState = buildInitialSimulatorDialogState({ draft, mode: 'live' })
  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )

  const interestedAnchor = buildSimulatedDmMessages(
    draft,
    interestedState,
  ).audienceMessages.find((message) => message.id === 'audience-anchor')
  const interestedLabels = (interestedAnchor?.preview.buttonRows ?? [])
    .flat()
    .map((button) => button.label)
  assert.ok(interestedLabels.includes("I'll be late"))

  const lateState = applySimulatorPreviewAction(
    interestedState,
    simulatedDmActionIds.audienceRunningLate,
    draft,
  )
  assert.equal(lateState.audienceRunningLate, true)

  const lateAnchor = buildSimulatedDmMessages(
    draft,
    lateState,
  ).audienceMessages.find((message) => message.id === 'audience-anchor')
  const lateLabels = (lateAnchor?.preview.buttonRows ?? [])
    .flat()
    .map((button) => button.label)
  assert.ok(!lateLabels.includes("I'll be late"))
  assert.ok(lateLabels.includes('Update delay'))
})

test('delay revisions notify again, repeat estimates stay quiet, and passing clears the estimate', () => {
  const initial = buildInitialSimulatorDialogState({ draft, mode: 'live' })
  const interested = applySimulatorLifecycleAction(
    initial,
    'audience-interested',
    draft,
  )
  const now = new Date()
  const late = applySimulatorLifecycleAction(
    interested,
    'audience-running-late',
    draft,
    now,
    15,
  )
  const repeated = applySimulatorLifecycleAction(
    late,
    'audience-running-late',
    draft,
    now,
    15,
  )
  assert.equal(repeated.history.length, late.history.length)

  const revised = applySimulatorLifecycleAction(
    late,
    'audience-running-late',
    draft,
    now,
    30,
  )
  assert.equal(revised.history.length, late.history.length + 1)
  assert.equal(revised.audienceRunningLateMinutes, 30)
  const { creatorMessages } = buildSimulatedDmMessages(draft, revised)
  assert.ok(
    creatorMessages.some((message) =>
      message.preview.content.includes('about 30 minutes late'),
    ),
  )

  const passed = applySimulatorLifecycleAction(revised, 'audience-pass', draft)
  assert.equal(passed.audienceRunningLateMinutes, null)
  const ended = { ...late, stage: 'ended' as const }
  assert.equal(
    applySimulatorLifecycleAction(
      ended,
      'audience-running-late',
      draft,
      now,
      60,
    ),
    ended,
  )
})

test('audience running-late is ignored unless the player is currently interested', () => {
  const initialState = buildInitialSimulatorDialogState({ draft, mode: 'live' })

  const fromNoReply = applySimulatorLifecycleAction(
    initialState,
    'audience-running-late',
    draft,
  )
  assert.equal(fromNoReply.audienceRunningLate, false)

  const passedState = applySimulatorLifecycleAction(
    initialState,
    'audience-pass',
    draft,
  )
  const fromPass = applySimulatorLifecycleAction(
    passedState,
    'audience-running-late',
    draft,
  )
  assert.equal(fromPass.audienceRunningLate, false)

  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const lateState = applySimulatorLifecycleAction(
    interestedState,
    'audience-running-late',
    draft,
  )
  const repeatedLateState = applySimulatorLifecycleAction(
    lateState,
    'audience-running-late',
    draft,
  )
  assert.equal(repeatedLateState.history.length, lateState.history.length)

  const clearedState = applySimulatorLifecycleAction(
    lateState,
    'audience-pass',
    draft,
  )
  assert.equal(clearedState.audienceRunningLate, false)
})

test('simulator ignores repeated voice activity triggers after the first one', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })

  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const firstVoiceState = applySimulatorLifecycleAction(
    interestedState,
    'creator-joined-voice',
    draft,
  )
  const repeatedVoiceState = applySimulatorLifecycleAction(
    firstVoiceState,
    'audience-joined-voice',
    draft,
  )

  assert.equal(firstVoiceState.hasVoiceChannelActivity, true)
  assert.equal(repeatedVoiceState, firstVoiceState)
})

test('simulator ignores creator voice activity until the audience is interested', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })

  const voiceState = applySimulatorLifecycleAction(
    initialState,
    'creator-joined-voice',
    draft,
  )

  assert.equal(voiceState, initialState)
})

test('simulator ignores repeated game launch triggers after the first one', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })

  const interestedState = applySimulatorLifecycleAction(
    initialState,
    'audience-interested',
    draft,
  )
  const firstLaunchState = applySimulatorLifecycleAction(
    interestedState,
    'creator-launched-game',
    draft,
  )
  const repeatedLaunchState = applySimulatorLifecycleAction(
    firstLaunchState,
    'audience-launched-game',
    draft,
  )

  assert.equal(firstLaunchState.hasGameLaunchActivity, true)
  assert.equal(repeatedLaunchState, firstLaunchState)
})

test('simulator ignores creator game launch activity until the audience is interested', () => {
  const initialState = buildInitialSimulatorDialogState({
    draft,
    mode: 'live',
  })

  const launchState = applySimulatorLifecycleAction(
    initialState,
    'creator-launched-game',
    draft,
  )

  assert.equal(launchState, initialState)
})
