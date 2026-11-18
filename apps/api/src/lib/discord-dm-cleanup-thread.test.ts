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
        referencedMessageId: 'invite-1',
      },
      {
        id: 'ended-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'invite-1',
      },
      {
        id: 'creator-note',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'different-anchor',
      },
      {
        id: 'user-reply',
        timestamp: new Date().toISOString(),
        authorId: 'user-1',
        referencedMessageId: 'invite-1',
      },
      {
        id: 'go-time-1',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'ack-1',
      },
    ],
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
        referencedMessageId: 'invite-1',
      },
    ],
  })

  assert.deepEqual(replyMessageIds, [])
})

test('collectReplyMessageIdsForCleanup includes live activity replies beneath creator and audience anchors', () => {
  const replyMessageIds = collectReplyMessageIdsForCleanup({
    botUserId: 'bot-1',
    referencedMessageIds: ['creator-summary', 'audience-invite'],
    messages: [
      {
        id: 'creator-voice-activity',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'creator-summary',
      },
      {
        id: 'creator-launch-activity',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'creator-summary',
      },
      {
        id: 'audience-voice-activity',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'audience-invite',
      },
      {
        id: 'audience-launch-activity',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'audience-invite',
      },
      {
        id: 'non-thread-message',
        timestamp: new Date().toISOString(),
        authorId: 'bot-1',
        referencedMessageId: 'different-anchor',
      },
    ],
  })

  assert.deepEqual(replyMessageIds, [
    'creator-voice-activity',
    'creator-launch-activity',
    'audience-voice-activity',
    'audience-launch-activity',
  ])
})
