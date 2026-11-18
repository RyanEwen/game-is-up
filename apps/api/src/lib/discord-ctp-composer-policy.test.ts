import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DiscordAutoPlayPromptStatus,
  DiscordCtpComposerStartMode,
  DiscordCtpComposerVoiceMode,
  PlayIntentScope,
} from '@prisma/client'
import {
  buildComposerPlayIntentRequest,
  composerAction,
  composerDraftId,
  composerModalId,
  isAutoPlayComposerPromptAvailable,
} from './discord-ctp-composer-policy.js'

const draft: Parameters<typeof buildComposerPlayIntentRequest>[0] = {
  allowParticipantInvites: true,
  gameIds: ['another-game'],
  targetFriendsListId: null,
  notifyScope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
  targetDiscordServerIds: ['chosen-server'],
  targetUserIds: [],
  title: 'My game night',
  note: 'Bring snacks',
  durationMinutes: 120,
  startMode: DiscordCtpComposerStartMode.SCHEDULED,
  startAt: new Date('2026-10-05T00:00:00Z'),
  voiceMode: DiscordCtpComposerVoiceMode.EXISTING_CHANNEL,
  voiceChannelId: 'selected-channel',
  voiceChannelName: 'Squad',
}

test('automatic posts preserve full composer options but force the detected game and immediate start', () => {
  const request = buildComposerPlayIntentRequest(draft, 'detected-game')
  assert.deepEqual(request.gameIds, ['detected-game'])
  assert.equal(request.startAt, undefined)
  assert.equal(request.durationMinutes, 120)
  assert.equal(request.title, 'My game night')
  assert.equal(request.note, 'Bring snacks')
  assert.equal(request.notifyScope, 'specific-discord-server')
  assert.deepEqual(request.targetDiscordServerIds, ['chosen-server'])
  assert.equal(request.voiceChannelId, 'selected-channel')
})

test('automatic posts support temporary channels and specific audiences', () => {
  const request = buildComposerPlayIntentRequest(
    {
      ...draft,
      notifyScope: PlayIntentScope.SPECIFIC_FRIENDS,
      targetUserIds: ['friend'],
      voiceMode: DiscordCtpComposerVoiceMode.TEMPORARY_SPACE,
    },
    'detected-game',
  )
  assert.equal(request.createDiscordSpace, true)
  assert.equal(request.voiceChannelId, undefined)
  assert.deepEqual(request.targetUserIds, ['friend'])
  assert.deepEqual(request.targetDiscordServerIds, [])
})

test('manual posts retain their selected games and scheduled start', () => {
  const request = buildComposerPlayIntentRequest(draft)
  assert.deepEqual(request.gameIds, ['another-game'])
  assert.equal(request.startAt, draft.startAt?.toISOString())
})

test('draft ids survive buttons and modal submissions without confusing legacy controls', () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  const modal = composerModalId(id, 'duration')
  assert.equal(composerDraftId(modal), id)
  assert.equal(composerAction(modal), 'modal:duration')
  assert.equal(composerAction(`guild-ctp:${id}:goto:TIMING`), 'goto:TIMING')
  assert.equal(composerDraftId('guild-ctp:goto:TIMING'), null)
  assert.equal(composerAction('guild-ctp:goto:TIMING'), 'goto:TIMING')
})

test('automatic composer rejects stale detections, handled prompts, opt-out, and other users', () => {
  const prompt = {
    userId: 'owner',
    status: DiscordAutoPlayPromptStatus.SENT,
    observation: { isActive: true },
    user: { discordAutoPromptPlayIntent: true },
  }
  assert.equal(isAutoPlayComposerPromptAvailable(prompt, 'owner'), true)
  assert.equal(isAutoPlayComposerPromptAvailable(prompt, 'another-user'), false)
  assert.equal(
    isAutoPlayComposerPromptAvailable(
      { ...prompt, observation: { isActive: false } },
      'owner',
    ),
    false,
  )
  assert.equal(
    isAutoPlayComposerPromptAvailable(
      { ...prompt, user: { discordAutoPromptPlayIntent: false } },
      'owner',
    ),
    false,
  )
  for (const status of [
    DiscordAutoPlayPromptStatus.ACCEPTED,
    DiscordAutoPlayPromptStatus.DECLINED,
    DiscordAutoPlayPromptStatus.EXPIRED,
  ]) {
    assert.equal(
      isAutoPlayComposerPromptAvailable({ ...prompt, status }, 'owner'),
      false,
    )
  }
  assert.equal(isAutoPlayComposerPromptAvailable(null, 'owner'), false)
})

test('both manual and detected-game composers preserve participant invitation opt-out', () => {
  assert.equal(
    buildComposerPlayIntentRequest(draft).allowParticipantInvites,
    true,
  )
  assert.equal(
    buildComposerPlayIntentRequest({ ...draft, allowParticipantInvites: false })
      .allowParticipantInvites,
    false,
  )
  assert.equal(
    buildComposerPlayIntentRequest(
      { ...draft, allowParticipantInvites: false },
      'detected-game',
    ).allowParticipantInvites,
    false,
  )
})
