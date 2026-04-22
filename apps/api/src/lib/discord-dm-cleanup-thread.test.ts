import assert from 'node:assert/strict'
import test from 'node:test'

import { collectReplyMessageIdsForCleanup } from './discord-dm-cleanup-thread.js'

test('collectReplyMessageIdsForCleanup keeps only bot-authored replies tied to tracked thread messages', () => {
  const replyMessageIds = collectReplyMessageIdsForCleanup({
    botUserId: 'bot-1',
    referencedMessageIds: ['invite-1', 'ack-1'],
    preservedMessageIds: ['ended-1'],
    messages: [
      {
        id: 'update-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'invite-1'
      },
      {
        id: 'ended-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'invite-1'
      },
      {
        id: 'creator-note',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'different-anchor'
      },
      {
        id: 'user-reply',
        timestamp: new Date().toISOString(),
        authorId: 'user-1',
        referencedMessageId: 'invite-1'
      },
      {
        id: 'go-time-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'ack-1'
      }
    ]
  })

  assert.deepEqual(replyMessageIds, ['update-1', 'go-time-1'])
})

test('collectReplyMessageIdsForCleanup returns no messages without a bot identity', () => {
  const replyMessageIds = collectReplyMessageIdsForCleanup({
    botUserId: null,
    referencedMessageIds: ['invite-1'],
    messages: [
      {
        id: 'update-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'invite-1'
      }
    ]
  })

  assert.deepEqual(replyMessageIds, [])
})