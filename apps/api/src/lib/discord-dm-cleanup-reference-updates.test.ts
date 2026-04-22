import assert from 'node:assert/strict'
import test from 'node:test'

import { buildArchivedNotificationReferenceUpdates } from './discord-dm-cleanup-reference-updates.js'

test('manual end keeps the archived invite and the new ended reply refs', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-1',
        messageId: 'invite-1',
        notificationId: 'notification-1',
        reference: 'notification'
      },
      {
        channelId: 'dm-1',
        messageId: 'response-old',
        notificationId: 'notification-1',
        reference: 'response'
      }
    ],
    keptMessageId: 'invite-1',
    replacementResponse: {
      notificationId: 'notification-1',
      channelId: 'dm-1',
      messageId: 'response-new'
    }
  })

  assert.deepEqual(updates.get('notification-1'), {
    discordDmChannelId: 'dm-1',
    discordDmMessageId: 'invite-1',
    recipientResponseDiscordDmChannelId: 'dm-1',
    recipientResponseDiscordDmMessageId: 'response-new'
  })
})

test('quiet archive keeps only the retained invite refs', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-2',
        messageId: 'invite-2',
        notificationId: 'notification-2',
        reference: 'notification'
      },
      {
        channelId: 'dm-2',
        messageId: 'response-2',
        notificationId: 'notification-2',
        reference: 'response'
      }
    ],
    keptMessageId: 'invite-2'
  })

  assert.deepEqual(updates.get('notification-2'), {
    discordDmChannelId: 'dm-2',
    discordDmMessageId: 'invite-2',
    recipientResponseDiscordDmChannelId: null,
    recipientResponseDiscordDmMessageId: null
  })
})

test('response-slot retention can preserve a kept response message', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-3',
        messageId: 'invite-3',
        notificationId: 'notification-3',
        reference: 'notification'
      },
      {
        channelId: 'dm-3',
        messageId: 'response-3',
        notificationId: 'notification-3',
        reference: 'response'
      }
    ],
    keptMessageId: 'response-3'
  })

  assert.deepEqual(updates.get('notification-3'), {
    discordDmChannelId: null,
    discordDmMessageId: null,
    recipientResponseDiscordDmChannelId: 'dm-3',
    recipientResponseDiscordDmMessageId: 'response-3'
  })
})