import assert from 'node:assert/strict'
import test from 'node:test'

import { buildArchivedNotificationReferenceUpdates } from './discord-dm-cleanup-reference-updates.js'

test('the kept anchor retains its reference', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-1',
        messageId: 'invite-1',
        notificationId: 'notification-1',
      },
    ],
    keptMessageId: 'invite-1',
  })

  assert.deepEqual(updates.get('notification-1'), {
    discordDmChannelId: 'dm-1',
    discordDmMessageId: 'invite-1',
  })
})

test('duplicate anchors for other notifications are cleared', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-2',
        messageId: 'invite-2',
        notificationId: 'notification-2',
      },
      {
        channelId: 'dm-2',
        messageId: 'invite-2-duplicate',
        notificationId: 'notification-2-duplicate',
      },
    ],
    keptMessageId: 'invite-2',
  })

  assert.deepEqual(updates.get('notification-2'), {
    discordDmChannelId: 'dm-2',
    discordDmMessageId: 'invite-2',
  })
  assert.deepEqual(updates.get('notification-2-duplicate'), {
    discordDmChannelId: null,
    discordDmMessageId: null,
  })
})

test('the kept reference wins even if a notification appears under multiple candidates', () => {
  const updates = buildArchivedNotificationReferenceUpdates({
    candidates: [
      {
        channelId: 'dm-3',
        messageId: 'stale-3',
        notificationId: 'notification-3',
      },
      {
        channelId: 'dm-3',
        messageId: 'invite-3',
        notificationId: 'notification-3',
      },
    ],
    keptMessageId: 'invite-3',
  })

  assert.deepEqual(updates.get('notification-3'), {
    discordDmChannelId: 'dm-3',
    discordDmMessageId: 'invite-3',
  })
})
