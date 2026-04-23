import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSimulatedDmMessages } from '../src/debug-dm-simulator.js'

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
})