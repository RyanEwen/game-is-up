import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import type { APIEmbed } from 'discord.js'

import {
  buildDiscordInviteReplyPayload,
  buildCreatorPlayIntentSummaryPreview,
  buildNotificationDirectMessagePreview,
  buildPlayIntentNotificationPromptPreview,
  shouldKeepCreatorDiscordInviteReply
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
    assert.match(voiceChannelField?.value ?? '', /Status: Active/)
    assert.match(voiceChannelField?.value ?? '', /Text channel:/)
    assert.match(voiceChannelField?.value ?? '', /Voice channel: .*ryan-friday-night-helldivers-abcdef/)
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
  assert.match(voiceChannelField?.value ?? '', /Status: Active/)
  assert.match(voiceChannelField?.value ?? '', /Text channel:/)
  assert.match(voiceChannelField?.value ?? '', /Voice channel:/)
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

test('creator invite replies are only kept while the call is active and has an invite URL', () => {
  assert.equal(shouldKeepCreatorDiscordInviteReply({
    isActive: true,
    inviteUrl: 'https://discord.gg/test-invite'
  }), true)

  assert.equal(shouldKeepCreatorDiscordInviteReply({
    isActive: false,
    inviteUrl: 'https://discord.gg/test-invite'
  }), false)

  assert.equal(shouldKeepCreatorDiscordInviteReply({
    isActive: true,
    inviteUrl: null
  }), false)
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
  assert.match(preview.content, /^✅ You're In/m)
  assert.match(preview.content, /Text channel:/)
})

test('go-time confirmed previews use the clock emoji heading', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    creatorDiscordUserId: 'discord-creator-1',
    creatorDisplayName: 'Ryan'
  })

  assert.match(preview.content, /^⏰ Go Time/m)
  assert.doesNotMatch(preview.content, /^🎮 Go Time/m)
})

test('pass acknowledgements use the cross-mark emoji heading', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.DECLINE,
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    renderSurface: 'response'
  })

  assert.match(preview.content, /^❎ Passed for Now/m)
  assert.doesNotMatch(preview.content, /^👎 Passed for Now/m)
  assert.match(preview.content, /You are marked as passing for now\. Passing is anonymous\./)
  assert.doesNotMatch(preview.content, /The creator has been notified\./)
})

test('specific-friends pass acknowledgements name the creator on one line', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.DECLINE,
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    passAcknowledgementMode: 'creator-notified',
    renderSurface: 'response'
  })

  assert.match(preview.content, /You are marked as passing for now\. <@discord-creator-1> has been notified\./)
  assert.doesNotMatch(preview.content, /The creator has been notified\./)
})

for (const notificationType of [
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
] as const) {
  test(`scheduled ${notificationType.toLowerCase()} previews keep go-time replies non-interactive`, () => {
    const preview = buildPlayIntentNotificationPromptPreview({
      notificationId: 'notification-1',
      playIntentId: 'play-intent-1',
      notificationType,
      title: 'Call to Play',
      body: 'Games: Helldivers 2\nWhen: Tonight',
      creatorUserId: 'creator-1',
      creatorDiscordUserId: 'discord-creator-1',
      creatorDisplayName: 'Ryan'
    })

    assert.deepEqual(preview.components, [])
    assert.match(preview.content, /See original invite above for details or to change your response\./)
    assert.doesNotMatch(preview.content, /Use the buttons below if you want in\./)
  })
}