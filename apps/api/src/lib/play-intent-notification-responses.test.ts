import assert from 'node:assert/strict'
import test from 'node:test'

import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import type { APIEmbed } from 'discord.js'

import {
  buildCreatorPlayIntentSummaryPreview,
  buildNotificationDirectMessagePreview,
  buildPlayIntentNotificationPromptPreview,
} from './play-intent-notification-responses.js'

for (const responseChoice of [
  NotificationResponseChoice.JOIN,
  NotificationResponseChoice.DECLINE,
] as const) {
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
        recipientSharesServer: true,
      },
      discordSpace: {
        status: 'active',
        recipientInServer: true,
        textChannelName: 'general',
        textChannelUrl: 'https://discord.com/channels/1/2',
        voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
        voiceChannelUrl: 'https://discord.com/channels/1/3',
        inviteUrl: 'https://discord.gg/test-invite',
      },
      intentDetails: {
        headline: 'Friday Night Helldivers',
        selectionMode: 'library',
        selectedGameTitles: ['Helldivers 2'],
        scope: 'FRIENDS_ONLY',
        note: null,
      },
    })

    assert.ok(preview.embeds)

    const firstEmbed = preview.embeds[0]
    const embedJson = (firstEmbed &&
    typeof firstEmbed === 'object' &&
    'toJSON' in firstEmbed &&
    typeof firstEmbed.toJSON === 'function'
      ? firstEmbed.toJSON()
      : firstEmbed) as unknown as APIEmbed | undefined
    const voiceChannelField = embedJson?.fields?.find(
      (field: { name: string; value: string }) =>
        field.name === '🎙 Voice Channel',
    )

    assert.ok(voiceChannelField)
    assert.match(voiceChannelField?.value ?? '', /Status: Active/)
    assert.match(voiceChannelField?.value ?? '', /Text channel:/)
    assert.match(
      voiceChannelField?.value ?? '',
      /Voice channel: .*ryan-friday-night-helldivers-abcdef/,
    )
    assert.match(
      voiceChannelField?.value ?? '',
      /https:\/\/discord\.gg\/test-invite/,
    )
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
      inviteUrl: 'https://discord.gg/test-invite',
    },
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
      timezoneId: 'UTC',
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
      deleteAfter: null,
    },
    currentTime: new Date('2026-04-25T19:30:00.000Z'),
  })

  assert.doesNotMatch(preview.content, /https:\/\/discord\.gg\/test-invite/)

  assert.ok(preview.embeds)

  const firstEmbed = preview.embeds[0]
  const embedJson = (firstEmbed &&
  typeof firstEmbed === 'object' &&
  'toJSON' in firstEmbed &&
  typeof firstEmbed.toJSON === 'function'
    ? firstEmbed.toJSON()
    : firstEmbed) as unknown as APIEmbed | undefined
  const voiceChannelField = embedJson?.fields?.find(
    (field: { name: string; value: string }) =>
      field.name === '🎙 Voice Channel',
  )

  assert.ok(voiceChannelField)
  assert.match(voiceChannelField?.value ?? '', /Status: Active/)
  assert.match(voiceChannelField?.value ?? '', /Text channel:/)
  assert.match(voiceChannelField?.value ?? '', /Voice channel:/)
  assert.match(
    voiceChannelField?.value ?? '',
    /https:\/\/discord\.gg\/test-invite/,
  )
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
      inviteUrl: 'https://discord.gg/test-invite',
    },
    renderSurface: 'response',
  })

  assert.doesNotMatch(preview.content, /Voice channel:/)
  assert.match(preview.content, /^✅ You're In/m)
  assert.match(preview.content, /Text channel:/)
})

test('non-member audience notification summaries keep temporary Discord channels inside the embed only', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    discordSpace: {
      status: 'active',
      recipientInServer: false,
      textChannelName: 'general',
      textChannelUrl: 'https://discord.com/channels/1/2',
      voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
      voiceChannelUrl: 'https://discord.com/channels/1/3',
      inviteUrl: 'https://discord.gg/test-invite',
    },
  })

  assert.ok(preview.embeds)

  const firstEmbed = preview.embeds[0]
  const embedJson = (firstEmbed &&
  typeof firstEmbed === 'object' &&
  'toJSON' in firstEmbed &&
  typeof firstEmbed.toJSON === 'function'
    ? firstEmbed.toJSON()
    : firstEmbed) as unknown as APIEmbed | undefined
  const voiceChannelField = embedJson?.fields?.find(
    (field: { name: string; value: string }) =>
      field.name === '🎙 Voice Channel',
  )

  assert.ok(voiceChannelField)
  assert.match(
    voiceChannelField?.value ?? '',
    /Temporary Discord channel: This call uses a temporary Discord channel\. Use the invite to access it\./,
  )
  assert.match(
    voiceChannelField?.value ?? '',
    /https:\/\/discord\.gg\/test-invite/,
  )
  assert.match(voiceChannelField?.value ?? '', /Text channel: general/)
  assert.match(
    voiceChannelField?.value ?? '',
    /Voice channel: ryan-friday-night-helldivers-abcdef/,
  )
  assert.doesNotMatch(
    voiceChannelField?.value ?? '',
    /Text channel: https:\/\/discord\.com\/channels\/1\/2/,
  )
  assert.doesNotMatch(
    voiceChannelField?.value ?? '',
    /Voice channel: https:\/\/discord\.com\/channels\/1\/3/,
  )
})

test('non-member join acknowledgements point recipients to the invite instead of channel links', () => {
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
      recipientInServer: false,
      textChannelName: 'general',
      textChannelUrl: 'https://discord.com/channels/1/2',
      voiceChannelName: 'ryan-friday-night-helldivers-abcdef',
      voiceChannelUrl: 'https://discord.com/channels/1/3',
      inviteUrl: 'https://discord.gg/test-invite',
    },
    renderSurface: 'response',
  })

  assert.match(
    preview.content,
    /Temporary Discord channel: This call uses a temporary Discord channel\. Use the invite to access it\./,
  )
  assert.match(
    preview.content,
    /Invite link \(shareable\): https:\/\/discord\.gg\/test-invite/,
  )
  assert.match(
    preview.content,
    /Join the server from the invite above to access it\./,
  )
  assert.doesNotMatch(
    preview.content,
    /Text channel: https:\/\/discord\.com\/channels\/1\/2/,
  )
  assert.doesNotMatch(preview.content, /Text channel: general/)
  assert.doesNotMatch(
    preview.content,
    /Voice channel: ryan-friday-night-helldivers-abcdef/,
  )
})

test('go-time confirmed previews use the clock emoji heading', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    creatorDiscordUserId: 'discord-creator-1',
    creatorDisplayName: 'Ryan',
  })

  assert.match(preview.content, /^⏰ Go Time/m)
  assert.doesNotMatch(preview.content, /^🎮 Go Time/m)
})

test('pass acknowledgements use a heading emoji that cannot be mistaken for the checkmark', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.DECLINE,
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    renderSurface: 'response',
  })

  assert.match(preview.content, /^❌ Can't Make It/m)
  assert.doesNotMatch(preview.content, /❎/)
  assert.doesNotMatch(preview.content, /✅/)
})

test('pass acknowledgements always name the creator as notified', () => {
  const preview = buildNotificationDirectMessagePreview({
    notificationId: 'notification-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.DECLINE,
    creatorDisplayName: 'Ryan',
    creatorDiscordUserId: 'discord-creator-1',
    playIntentIsActive: true,
    renderSurface: 'response',
  })

  assert.match(
    preview.content,
    /You are marked as unable to make it\. <@discord-creator-1> has been notified\./,
  )
  assert.doesNotMatch(preview.content, /anonymous/i)
})

for (const notificationType of [
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
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
      creatorDisplayName: 'Ryan',
    })

    assert.deepEqual(preview.components, [])
    assert.match(
      preview.content,
      /See original invite above for details or to change your response\./,
    )
    assert.doesNotMatch(
      preview.content,
      /Use the buttons below if you want in\./,
    )
  })
}

function collectButtonLabels(
  components: ReturnType<
    typeof buildPlayIntentNotificationPromptPreview
  >['components'],
) {
  const labels: string[] = []

  for (const row of components ?? []) {
    const rowJson = (
      row as { toJSON: () => { components?: Array<{ label?: string }> } }
    ).toJSON()

    for (const component of rowJson.components ?? []) {
      if (component.label) {
        labels.push(component.label)
      }
    }
  }

  return labels
}

test('interested recipients see an "I\'ll be late" button on the prompt', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.JOIN,
    creatorUserId: 'creator-1',
    creatorDiscordUserId: 'discord-creator-1',
    creatorDisplayName: 'Ryan',
  })

  const labels = collectButtonLabels(preview.components)
  assert.ok(labels.includes("I'll be late"))
  assert.ok(labels.includes("Can't make it"))
  assert.ok(!labels.includes("I'm interested"))
})

test('late recipients can update their delay estimate', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: NotificationResponseChoice.JOIN,
    runningLate: true,
    creatorUserId: 'creator-1',
    creatorDiscordUserId: 'discord-creator-1',
    creatorDisplayName: 'Ryan',
  })

  const labels = collectButtonLabels(preview.components)
  assert.ok(!labels.includes("I'll be late"))
  assert.ok(labels.includes('Update delay'))
  assert.ok(labels.includes("Can't make it"))
})

test('recipients who have not accepted do not see an "I\'ll be late" button', () => {
  const preview = buildPlayIntentNotificationPromptPreview({
    notificationId: 'notification-1',
    playIntentId: 'play-intent-1',
    notificationType: NotificationType.FRIEND_PLAYING,
    title: 'Call to Play',
    body: 'Games: Helldivers 2\nWhen: Tonight',
    responseChoice: null,
    creatorUserId: 'creator-1',
    creatorDiscordUserId: 'discord-creator-1',
    creatorDisplayName: 'Ryan',
  })

  const labels = collectButtonLabels(preview.components)
  assert.ok(!labels.includes("I'll be late"))
  assert.ok(labels.includes("I'm interested"))
})
