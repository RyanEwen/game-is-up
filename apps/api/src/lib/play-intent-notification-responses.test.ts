import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import type { APIEmbed } from 'discord.js'

import {
  buildDiscordInviteReplyPayload,
  buildCreatorPlayIntentSummaryPreview,
  buildNotificationDirectMessagePreview,
  buildPlayIntentNotificationPromptPreview
} from './play-intent-notification-responses.js'

for (const responseChoice of [NotificationResponseChoice.JOIN, NotificationResponseChoice.DECLINE] as const) {
  test(`audience notification summaries keep the voice channel field after ${responseChoice.toLowerCase()}`, () => {
    const preview = buildNotificationDirectMessagePreview({
      notificationId: 'notification-1',
      playIntentId: 'play-intent-1',
      notificationType: NotificationType.FRIEND_PLAYING,
      title: 'Call to Play',
      body: 'Games: Helldivers 2\nWhen: Tonight',
      responseChoice,
      creatorUserId: 'creator-1',
      creatorDiscordUserId: 'discord-creator-1',
      creatorDisplayName: 'Ryan',
      playIntentIsActive: true,
      voiceChannel: {
        channelId: null,
        channelName: 'ryan-friday-night-helldivers-abcdef',
        recipientSharesServer: true
      },
      discordSpace: {
        status: 'active',
        recipientInServer: true,
        textChannelName: 'general',
        textChannelUrl: 'https://discord.com/channels/1/2',
        voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
        voiceChannelUrl: 'https://discord.com/channels/1/3',
        inviteUrl: 'https://discord.gg/test-invite'
      },
      intentDetails: {
        headline: 'Friday Night Helldivers',
        selectionMode: 'library',
        selectedGameTitles: ['Helldivers 2'],
        scope: 'FRIENDS_ONLY',
        note: null
      }
    })

    assert.ok(preview.embeds)

    const firstEmbed = preview.embeds[0]
    const embedJson = (firstEmbed && typeof firstEmbed === 'object' && 'toJSON' in firstEmbed && typeof firstEmbed.toJSON === 'function'
      ? firstEmbed.toJSON()
      : firstEmbed) as unknown as APIEmbed | undefined
    const voiceChannelField = embedJson?.fields?.find((field: { name: string; value: string }) => field.name === '🎙 Voice Channel')

    assert.ok(voiceChannelField)
    assert.match(voiceChannelField?.value ?? '', /ryan-friday-night-helldivers-abcdef/)
    assert.match(voiceChannelField?.value ?? '', /https:\/\/discord\.gg\/test-invite/)
  })
}

test('audience invite summaries keep the temporary Discord invite URL out of the summary content', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    creatorDisplayName: 'Ryan',
    discordSpace: {
      status: 'active',
      recipientInServer: true,
      textChannelName: 'general',
      textChannelUrl: 'https://discord.com/channels/1/2',
      voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
      voiceChannelUrl: 'https://discord.com/channels/1/3',
      inviteUrl: 'https://discord.gg/test-invite'
    }
  })

  assert.doesNotMatch(preview.content, /https:\/\/discord\.gg\/test-invite/)
})

test('creator summary DMs keep the temporary Discord invite URL out of the summary content', () => {
  const preview = buildCreatorPlayIntentSummaryPreview({
    id: 'play-intent-1',
    headline: 'Friday Night Helldivers',
    note: '',
    selectionMode: 'ENTIRE_LIBRARY',
    scope: 'FRIENDS_ONLY',
    windowStartsAt: new Date('2026-04-25T20:00:00.000Z'),
    windowEndsAt: new Date('2026-04-25T22:00:00.000Z'),
    expiresAt: new Date('2026-04-25T22:00:00.000Z'),
    voiceChannelName: null,
    user: {
      displayName: 'Ryan',
      timezoneId: 'UTC'
    },
    targetDiscordServers: [],
    targetFriends: [],
    games: [],
    notifications: [],
    discordSpace: {
      status: 'ACTIVE',
      textChannelName: 'general',
      textChannelUrl: 'https://discord.com/channels/1/2',
      voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
      voiceChannelUrl: 'https://discord.com/channels/1/3',
      inviteUrl: 'https://discord.gg/test-invite',
      deleteAfter: null
    },
    currentTime: new Date('2026-04-25T19:30:00.000Z')
  })

  assert.doesNotMatch(preview.content, /https:\/\/discord\.gg\/test-invite/)

  assert.ok(preview.embeds)

  const firstEmbed = preview.embeds[0]
  const embedJson = (firstEmbed && typeof firstEmbed === 'object' && 'toJSON' in firstEmbed && typeof firstEmbed.toJSON === 'function'
    ? firstEmbed.toJSON()
    : firstEmbed) as unknown as APIEmbed | undefined
  const voiceChannelField = embedJson?.fields?.find((field: { name: string; value: string }) => field.name === '🎙 Voice Channel')

  assert.ok(voiceChannelField)
  assert.match(voiceChannelField?.value ?? '', /https:\/\/discord\.gg\/test-invite/)
})

test('temporary Discord invite replies use the invite URL as reply content', () => {
  const payload = buildDiscordInviteReplyPayload({
    discordUserId: 'discord-user-1',
    inviteUrl: 'https://discord.gg/test-invite',
    replyTo: {
      channelId: 'dm-channel-1',
      messageId: 'dm-message-1'
    }
  })

  assert.deepEqual(payload, {
    discordUserId: 'discord-user-1',
    content: 'https://discord.gg/test-invite',
    components: [],
    replyTo: {
      channelId: 'dm-channel-1',
      messageId: 'dm-message-1'
    }
  })
})

test('the joined acknowledgement DM no longer repeats the voice channel line', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.JOIN,
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    discordSpace: {
      status: 'active',
      recipientInServer: true,
      textChannelName: 'general',
      textChannelUrl: 'https://discord.com/channels/1/2',
      voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
      voiceChannelUrl: 'https://discord.com/channels/1/3',
      inviteUrl: 'https://discord.gg/test-invite'
    },
    renderSurface: 'response'
  })

  assert.doesNotMatch(preview.content, /Voice channel:/)
  assert.match(preview.content, /Text channel:/)
})