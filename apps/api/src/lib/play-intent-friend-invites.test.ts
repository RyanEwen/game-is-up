/** Unit tests for participant invitations; the database regressions are in play-intent-friend-invites.integration.test.ts. */
import assert from 'node:assert/strict'
import type { ButtonInteraction } from 'discord.js'
import { randomUUID } from 'node:crypto'
import test, { mock } from 'node:test'
import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import { playIntentFriendInviteRequestSchema, upsertPlayIntentRequestSchema } from '@game-is-up/shared'
import { buildPlayIntentFriendInvitePicker } from './play-intent-friend-invite-picker.js'
import { buildRuntimeNotificationDirectMessagePreview, buildPlayIntentNotificationComponents } from './play-intent-notification-responses.js'
import { handlePlayIntentFriendInviteInteraction } from './discord-play-intent-friend-invites.js'

test('invitation contract accepts one friend and rejects bulk or extra targets', () => {
  assert.equal(playIntentFriendInviteRequestSchema.safeParse({ friendUserId: randomUUID() }).success, true)
  assert.equal(playIntentFriendInviteRequestSchema.safeParse({ friendUserIds: [randomUUID(), randomUUID()] }).success, false)
  assert.equal(playIntentFriendInviteRequestSchema.safeParse({ friendUserId: randomUUID(), targetUserIds: [randomUUID()] }).success, false)
})

test('request preserves omitted permission and an explicit opt-out', () => {
  const request = { selectionMode: 'subset', notifyScope: 'friends-only', gameIds: [randomUUID()], durationMinutes: 60 }
  assert.equal(upsertPlayIntentRequestSchema.parse(request).allowParticipantInvites, undefined)
  assert.equal(upsertPlayIntentRequestSchema.parse({ ...request, allowParticipantInvites: false }).allowParticipantInvites, false)
})

test('DM picker pages friends and limits every selection to one', () => {
  const friends = Array.from({ length: 27 }, (_, index) => ({ id: randomUUID(), displayName: `Friend ${index}`, handle: `friend${index}` }))
  const first = buildPlayIntentFriendInvitePicker(randomUUID(), friends).components[0]!.toJSON().components[0]!
  assert.equal('options' in first && first.options.length, 25)
  assert.equal('max_values' in first && first.max_values, 1)
  const last = buildPlayIntentFriendInvitePicker(randomUUID(), friends, 999).components[0]!.toJSON().components[0]!
  assert.equal('options' in last && last.options.length, 2)
  assert.equal(buildPlayIntentFriendInvitePicker(randomUUID(), []).components.length, 0)
})

test('only accepted recipients with organizer permission see the DM invite action', () => {
  function hasInvite(choice: NotificationResponseChoice | null, allowParticipantInvites: boolean) {
    return JSON.stringify(buildPlayIntentNotificationComponents(randomUUID(), undefined, undefined, choice, NotificationType.FRIEND_PLAYING, {
      forceInteractive: true, playIntentId: randomUUID(), allowParticipantInvites
    })).includes('Invite a friend')
  }
  assert.equal(hasInvite(NotificationResponseChoice.JOIN, true), true)
  assert.equal(hasInvite(NotificationResponseChoice.JOIN, false), false)
  assert.equal(hasInvite(null, true), false)
  assert.equal(hasInvite(NotificationResponseChoice.DECLINE, true), false)
})

test('runtime reconciliation keeps REST fallbacks and scheduled informational messages', () => {
  const options = { notificationId: randomUUID(), playIntentId: randomUUID(), title: 'Call', body: 'Call',
    responseChoice: NotificationResponseChoice.JOIN, playIntentIsActive: true, allowParticipantInvites: true }
  const invitation = buildRuntimeNotificationDirectMessagePreview({ ...options, notificationType: NotificationType.FRIEND_PLAYING })
  assert.ok(!JSON.stringify(invitation.components).includes('custom_id'))
  for (const notificationType of [NotificationType.SCHEDULED_PLAY_INTENT_REMINDER, NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED]) {
    assert.equal(buildRuntimeNotificationDirectMessagePreview({ ...options, notificationType }).components.length, 0)
  }
})

test('failed Discord acknowledgement is contained before any invitation work', async () => {
  const failure = mock.method(console, 'error', () => undefined)
  try {
    await handlePlayIntentFriendInviteInteraction({
      customId: `ctp-friend-invite:${randomUUID()}:open`,
      deferReply: async () => { throw new Error('Acknowledgement unavailable') }
    } as unknown as ButtonInteraction)
    assert.equal(failure.mock.callCount(), 1)
  } finally {
    failure.mock.restore()
  }
})
