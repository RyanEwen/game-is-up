import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder
} from 'discord.js'
import {
  AuthProvider,
  NotificationResponseChoice,
  NotificationType
} from '@prisma/client'
import { editDiscordDirectMessage, sendDiscordDirectMessages, supportsDiscordInteractiveMessages } from './discord-bot-runtime.js'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { normalizeTimezoneId } from './timezone-label.js'

const playIntentNotificationPrefix = 'play-intent-response'
const playIntentMutePrefix = 'play-intent-mute'
const scheduledPlayIntentCheckInPrefix = 'scheduled-play-intent-check-in'
const creatorPlayIntentSummaryPrefix = 'creator-play-intent-summary'

type PlayIntentNotificationAction = {
  notificationId: string;
  response: PlayIntentRecipientResponse;
}

type PlayIntentMuteAction = {
  creatorUserId: string;
}

type ScheduledPlayIntentCheckInAction = {
  notificationId: string;
  response: NotificationResponseChoice;
}

type CreatorPlayIntentSummaryAction = {
  playIntentId: string;
  action: 'cancel';
}

type PlayIntentRecipientResponse = 'JOIN' | 'DECLINE'

type DirectMessagePreviewPayload = {
  content: string;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

type ResolvablePlayIntentNotification = {
  id: string;
  userId: string;
  gameId: string | null;
  responseChoice: NotificationResponseChoice | null;
  user: {
    displayName: string;
  };
  game: {
    title: string;
  } | null;
  playIntent: {
    id: string;
    user: {
      id: string;
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  } | null;
}

type CreatorPlayIntentSummarySnapshot = {
  id: string;
  headline: string;
  note: string;
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_DISCORD_SERVER';
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  voiceChannelName: string | null;
  creatorDiscordDmChannelId: string | null;
  creatorDiscordDmMessageId: string | null;
  user: {
    id: string;
    displayName: string;
    timezoneId: string;
    identities: { providerUserId: string }[];
  };
  targetDiscordServer: {
    name: string;
  } | null;
  targetFriends: {
    friendUser: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  games: {
    game: {
      title: string;
    };
  }[];
  notifications: {
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }[];
}

export class PlayIntentNotificationResponseError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'PlayIntentNotificationResponseError'
  }
}

function buildPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function buildDiscordUserMention(discordUserId: string | null | undefined) {
  return discordUserId ? `<@${discordUserId}>` : null
}

function buildDiscordUserLabel(displayName: string, discordUserId: string | null | undefined) {
  return buildDiscordUserMention(discordUserId) ?? displayName
}

function replaceDisplayNameWithMention(text: string, displayName: string, discordUserId: string | null | undefined) {
  if (!discordUserId || !displayName.trim()) {
    return text
  }

  return text.split(displayName).join(buildDiscordUserLabel(displayName, discordUserId))
}

function buildLinkRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open in Game's Up")
      .setStyle(ButtonStyle.Link)
      .setURL(buildPlayUrl())
  )
}

function buildCreatorSummaryActionRow(playIntentId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:cancel`)
      .setLabel('Cancel CTP')
      .setStyle(ButtonStyle.Danger)
  )
}

function buildResponseRow(notificationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:join`)
      .setLabel('I\'m interested')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:pass`)
      .setLabel('Pass')
      .setStyle(ButtonStyle.Secondary)
  )
}

function buildMuteLabel(creatorDisplayName: string) {
  const normalized = creatorDisplayName.trim()
  const baseLabel = normalized ? `Mute ${normalized}` : 'Mute creator'

  // Discord button labels are limited to 80 characters.
  if (baseLabel.length <= 80) {
    return baseLabel
  }

  return `${baseLabel.slice(0, 77)}...`
}

function buildMuteRow(creatorUserId: string, creatorDisplayName: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${playIntentMutePrefix}:${creatorUserId}`)
      .setLabel(buildMuteLabel(creatorDisplayName))
      .setStyle(ButtonStyle.Danger)
  )
}

function buildScheduledCheckInResponseRow(notificationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:confirm`)
      .setLabel('Still on')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:cancel`)
      .setLabel('Not happening')
      .setStyle(ButtonStyle.Secondary)
  )
}

export function buildPlayIntentDirectMessage(
  title: string,
  body: string,
  creatorDiscordUserId?: string | null,
  creatorDisplayName?: string | null,
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  joinCount?: number
) {
  const titleWithCreatorMention = creatorDisplayName
    ? replaceDisplayNameWithMention(title, creatorDisplayName, creatorDiscordUserId)
    : title
  const replacedBody = creatorDisplayName
    ? replaceDisplayNameWithMention(body, creatorDisplayName, creatorDiscordUserId)
    : body
  const bodyWithCreatorMention = creatorDiscordUserId && replacedBody === body
    ? `${replacedBody} Posted by <@${creatorDiscordUserId}>.`
    : replacedBody

  const voiceChannelLine = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `Voice channel: <#${voiceChannel.channelId}>`
      : `Voice channel: ${voiceChannel.channelName}`
    : null

  const joinCountLine = joinCount && joinCount > 0
    ? `${joinCount} ${joinCount === 1 ? 'person is' : 'people are'} showing interest.`
    : null

  return [
    `**${titleWithCreatorMention}**`,
    bodyWithCreatorMention,
    voiceChannelLine,
    joinCountLine,
    supportsDiscordInteractiveMessages()
      ? 'Are you planning to join this call to play?'
      : 'Open Game\'s Up to answer this call to play.',
    supportsDiscordInteractiveMessages()
      ? "Use the buttons below to answer. You can still open Game's Up afterward and post your own call if you want to widen the group."
      : "You can still open Game's Up afterward and post your own call if you want to widen the group."
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildPlayIntentNotificationComponents(
  notificationId: string,
  creatorUserId?: string,
  creatorDisplayName?: string
) {
  const rows = [buildResponseRow(notificationId)]
  if (creatorUserId && creatorDisplayName) {
    rows.push(buildMuteRow(creatorUserId, creatorDisplayName))
  }
  rows.push(buildLinkRow())
  return supportsDiscordInteractiveMessages() ? rows : [buildLinkRow()]
}

export function buildScheduledPlayIntentCheckInComponents(notificationId: string) {
  return supportsDiscordInteractiveMessages()
    ? [buildScheduledCheckInResponseRow(notificationId), buildLinkRow()]
    : [buildLinkRow()]
}

export function buildNotificationDirectMessagePreview(options: {
  notificationId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  responseChoice?: NotificationResponseChoice | null;
  creatorUserId?: string | null;
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
  gameTitle?: string | null;
  playIntentIsActive?: boolean;
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  joinCount?: number;
}): DirectMessagePreviewPayload {
  const creatorLabel = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'this player'

  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN) {
    if (options.responseChoice === NotificationResponseChoice.CANCELED) {
      return {
        content: buildCreatorCanceledMessage(),
        components: [buildLinkRow()]
      }
    }

    if (options.responseChoice === NotificationResponseChoice.CONFIRMED) {
      return {
        content: buildCreatorConfirmedMessage(),
        components: [buildLinkRow()]
      }
    }

    if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
      return {
        content: buildExpiredMessage('This call to play expired before you confirmed.'),
        components: [buildLinkRow()]
      }
    }

    return {
      content: buildCreatorCheckInPromptMessage(
        options.creatorDisplayName
          ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
          : 'there'
      ),
      components: buildScheduledPlayIntentCheckInComponents(options.notificationId)
    }
  }

  if (
    options.notificationType === NotificationType.FRIEND_PLAYING
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
  ) {
    if (options.notificationType !== NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED) {
      if (options.responseChoice === NotificationResponseChoice.JOIN) {
        return {
          content: buildJoinAcceptedMessage(creatorLabel),
          components: buildPlayIntentNotificationComponents(
            options.notificationId,
            options.creatorUserId ?? undefined,
            options.creatorDisplayName ?? undefined
          )
        }
      }

      if (options.responseChoice === NotificationResponseChoice.DECLINE) {
        return {
          content: buildPassAcceptedMessage(),
          components: buildPlayIntentNotificationComponents(
            options.notificationId,
            options.creatorUserId ?? undefined,
            options.creatorDisplayName ?? undefined
          )
        }
      }

      if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
        return {
          content: buildExpiredMessage(buildSessionEndedReason(creatorLabel, options.gameTitle ?? null)),
          components: [buildLinkRow()]
        }
      }
    }

    return {
      content: buildPlayIntentDirectMessage(
        options.title,
        options.body,
        options.creatorDiscordUserId,
        options.creatorDisplayName,
        options.voiceChannel,
        options.joinCount
      ),
      components: options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ? [buildLinkRow()]
        : buildPlayIntentNotificationComponents(
            options.notificationId,
            options.creatorUserId ?? undefined,
            options.creatorDisplayName ?? undefined
          )
    }
  }

  return {
    content: [`**${options.title}**`, options.body].filter(Boolean).join('\n\n'),
    components: [buildLinkRow()]
  }
}

function buildCreatorPlayIntentSummaryComponents(playIntentId: string, isActive: boolean) {
  if (!isActive || !supportsDiscordInteractiveMessages()) {
    return [buildLinkRow()]
  }

  return [buildCreatorSummaryActionRow(playIntentId), buildLinkRow()]
}

function formatSummaryDateTime(date: Date, timezoneId: string) {
  const normalizedTimezoneId = normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}

function summarizeCreatorAudience(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (snapshot.scope === 'SPECIFIC_DISCORD_SERVER' && snapshot.targetDiscordServer) {
    return `Audience: Discord server ${snapshot.targetDiscordServer.name}`
  }

  if (snapshot.scope === 'SPECIFIC_FRIENDS') {
    const names = snapshot.targetFriends
      .map((entry) => buildDiscordUserLabel(entry.friendUser.displayName, entry.friendUser.identities?.[0]?.providerUserId))
      .sort((left, right) => left.localeCompare(right))

    if (names.length <= 4) {
      return `Audience: Specific friends (${names.join(', ')})`
    }

    return `Audience: Specific friends (${names.slice(0, 4).join(', ')} +${names.length - 4} more)`
  }

  if (snapshot.scope === 'MUTUAL_FRIENDS') {
    return 'Audience: Friends and your selected network'
  }

  return 'Audience: Friends only'
}

function summarizeCreatorGames(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (snapshot.selectionMode === 'ENTIRE_LIBRARY') {
    return 'Games: Your library'
  }

  const titles = snapshot.games.map((entry) => entry.game.title).sort((left, right) => left.localeCompare(right))

  if (titles.length <= 4) {
    return `Games: ${titles.join(', ')}`
  }

  return `Games: ${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function getCreatorSummaryRecipientStats(snapshot: CreatorPlayIntentSummarySnapshot) {
  const relevantNotifications = snapshot.notifications.filter((notification) =>
    notification.type === NotificationType.FRIEND_PLAYING || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
  )

  const latestByUserId = new Map<string, {
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
  }>()
  const deliveredUserIds = new Set<string>()

  for (const notification of relevantNotifications) {
    if (notification.deliveredAt) {
      deliveredUserIds.add(notification.userId)
    }

    if (!latestByUserId.has(notification.userId)) {
      latestByUserId.set(notification.userId, {
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice
      })
    }
  }

  let interestedCount = 0
  let passedCount = 0
  let waitingCount = 0

  for (const status of latestByUserId.values()) {
    if (status.responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1
      continue
    }

    if (status.responseChoice === NotificationResponseChoice.DECLINE) {
      passedCount += 1
      continue
    }

    if (!status.respondedAt) {
      waitingCount += 1
    }
  }

  return {
    matchedCount: latestByUserId.size,
    deliveredCount: deliveredUserIds.size,
    interestedCount,
    passedCount,
    waitingCount
  }
}

function getCreatorSummaryStatus(snapshot: CreatorPlayIntentSummarySnapshot, currentTime = new Date()) {
  const latestCheckIn = snapshot.notifications.find((notification) => notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN)

  if (snapshot.expiresAt <= currentTime) {
    return 'Status: Closed'
  }

  if (latestCheckIn?.responseChoice === NotificationResponseChoice.CANCELED) {
    return 'Status: Closed'
  }

  if (latestCheckIn && !latestCheckIn.respondedAt && snapshot.windowStartsAt <= currentTime) {
    return 'Status: Starting now - waiting for your confirmation'
  }

  if (snapshot.windowStartsAt.getTime() > currentTime.getTime() + 60 * 1000) {
    return 'Status: Scheduled'
  }

  return 'Status: Live now'
}

function buildCreatorPlayIntentSummaryMessage(snapshot: CreatorPlayIntentSummarySnapshot, currentTime = new Date()) {
  const stats = getCreatorSummaryRecipientStats(snapshot)
  const startsAtLabel = formatSummaryDateTime(snapshot.windowStartsAt, snapshot.user.timezoneId)
  const endsAtLabel = formatSummaryDateTime(snapshot.windowEndsAt, snapshot.user.timezoneId)
  const guidance = snapshot.expiresAt > currentTime
    ? supportsDiscordInteractiveMessages()
      ? 'Use the buttons below to open Game\'s Up or cancel this call to play.'
      : 'Open Game\'s Up below if you want to edit or cancel this call to play.'
    : 'Open Game\'s Up below if you want to post another call to play.'

  return [
    '**CTP summary**',
    getCreatorSummaryStatus(snapshot, currentTime),
    `Title: ${snapshot.headline}`,
    summarizeCreatorGames(snapshot),
    summarizeCreatorAudience(snapshot),
    `Window: ${startsAtLabel} to ${endsAtLabel}`,
    snapshot.voiceChannelName ? `Voice channel: ${snapshot.voiceChannelName}` : null,
    snapshot.note ? `Note: ${snapshot.note}` : null,
    [
      '**Responses**',
      `Interested: ${stats.interestedCount}`,
      `Passed: ${stats.passedCount}`,
      `Waiting: ${stats.waitingCount}`
    ].join('\n'),
    stats.matchedCount > 0
      ? `Reach: ${stats.deliveredCount} of ${stats.matchedCount} matched players received a Discord DM.`
      : 'Reach: No matching players were found yet.',
    guidance
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildCreatorPlayIntentSummaryPreview(snapshot: {
  id: string;
  headline: string;
  note: string;
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_DISCORD_SERVER';
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  voiceChannelName: string | null;
  user: {
    displayName: string;
    timezoneId: string;
  };
  targetDiscordServer: {
    name: string;
  } | null;
  targetFriends: {
    friendUser: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  games: {
    game: {
      title: string;
    };
  }[];
  notifications: {
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }[];
  currentTime?: Date;
}): DirectMessagePreviewPayload {
  const currentTime = snapshot.currentTime ?? new Date()

  return {
    content: buildCreatorPlayIntentSummaryMessage(snapshot as CreatorPlayIntentSummarySnapshot, currentTime),
    components: buildCreatorPlayIntentSummaryComponents(snapshot.id, snapshot.expiresAt > currentTime)
  }
}

async function getCreatorPlayIntentSummarySnapshot(playIntentId: string) {
  return prisma.playIntent.findUnique({
    where: {
      id: playIntentId
    },
    select: {
      id: true,
      headline: true,
      note: true,
      selectionMode: true,
      scope: true,
      windowStartsAt: true,
      windowEndsAt: true,
      expiresAt: true,
      voiceChannelName: true,
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD
            },
            select: {
              providerUserId: true
            }
          }
        }
      },
      targetDiscordServer: {
        select: {
          name: true
        }
      },
      targetFriends: {
        select: {
          friendUser: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      },
      games: {
        select: {
          game: {
            select: {
              title: true
            }
          }
        }
      },
      notifications: {
        where: {
          type: {
            in: [
              NotificationType.FRIEND_PLAYING,
              NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
              NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
            ]
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          userId: true,
          type: true,
          respondedAt: true,
          responseChoice: true,
          deliveredAt: true,
          createdAt: true
        }
      }
    }
  })
}

async function sendOrEditCreatorPlayIntentSummary(playIntentId: string) {
  const snapshot = await getCreatorPlayIntentSummarySnapshot(playIntentId)

  if (!snapshot) {
    return
  }

  const creatorDiscordUserId = snapshot.user.identities[0]?.providerUserId

  if (!creatorDiscordUserId) {
    return
  }

  const content = buildCreatorPlayIntentSummaryMessage(snapshot)
  const components = buildCreatorPlayIntentSummaryComponents(playIntentId, snapshot.expiresAt > new Date())

  if (snapshot.creatorDiscordDmChannelId && snapshot.creatorDiscordDmMessageId) {
    const editResult = await editDiscordDirectMessage({
      channelId: snapshot.creatorDiscordDmChannelId,
      messageId: snapshot.creatorDiscordDmMessageId,
      content,
      components
    })

    if (editResult.status === 'edited') {
      return
    }
  }

  const dmResult = (await sendDiscordDirectMessages([
    {
      discordUserId: creatorDiscordUserId,
      content,
      components
    }
  ]))[0]

  if (dmResult?.status !== 'sent') {
    return
  }

  if (dmResult.emulated) {
    return
  }

  await prisma.playIntent.update({
    where: {
      id: playIntentId
    },
    data: {
      creatorDiscordDmChannelId: dmResult.channelId,
      creatorDiscordDmMessageId: dmResult.messageId
    }
  })
}

export async function syncCreatorPlayIntentSummaryMessages(playIntentIds: string[]) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  for (const playIntentId of uniquePlayIntentIds) {
    await sendOrEditCreatorPlayIntentSummary(playIntentId)
  }
}

function buildExpiredMessage(reason: string) {
  return [
    'This call-to-play prompt is no longer available.',
    reason,
    "Open Game's Up if you still want to coordinate or post your own call to play."
  ].join('\n\n')
}

function buildJoinAcceptedMessage(creatorLabel: string) {
  return [
    `I marked you as interested in ${creatorLabel}'s call to play.`,
    "If you want to widen the group, you can still open Game's Up and post your own call too."
  ].join('\n\n')
}

function buildPassAcceptedMessage() {
  return [
    'Got it. I marked this call to play as passed for now.',
    "You can still switch to \"I'm interested\" later."
  ].join('\n\n')
}

function buildSessionEndedReason(creatorLabel: string, gameTitle: string | null) {
  return gameTitle
    ? `${creatorLabel}'s ${gameTitle} session ended before you answered.`
    : `${creatorLabel}'s call to play ended before you answered.`
}

function buildCreatorCheckInPromptMessage(creatorLabel: string) {
  return [
    `Your scheduled call to play is starting now, ${creatorLabel}.`,
    supportsDiscordInteractiveMessages()
      ? 'Is this call to play still on?'
      : 'Open Game\'s Up to confirm whether this call to play is still on.'
  ].join('\n\n')
}

function buildCreatorConfirmedMessage() {
  return [
    'Perfect. I let everyone know your call to play is still on.',
    'I also reminded anyone who had not answered yet.'
  ].join('\n\n')
}

function buildCreatorCanceledMessage() {
  return [
    'Got it. I will not send any go-time reminders for this call to play.',
    'You can post a fresh call to play whenever you are ready.'
  ].join('\n\n')
}

function buildCreatorCheckInAlreadyHandledMessage(responseChoice: NotificationResponseChoice | null) {
  if (responseChoice === NotificationResponseChoice.CONFIRMED) {
    return 'You already confirmed that this call to play is still on.'
  }

  if (responseChoice === NotificationResponseChoice.CANCELED) {
    return 'You already marked this call to play as not happening.'
  }

  return 'This check-in was already handled earlier.'
}

function buildGoTimeConfirmedCopy(creatorDisplayName: string) {
  return {
    title: `${creatorDisplayName} confirmed the call to play is on`,
    body: `${creatorDisplayName} confirmed the call to play is still on. It is go time.`
  }
}

function buildGoTimeReminderCopy(creatorDisplayName: string) {
  return {
    title: `${creatorDisplayName} confirmed the call to play is on`,
    body: `${creatorDisplayName} confirmed this call to play is still on. Are you interested?`
  }
}

function parseAction(customId: string): PlayIntentNotificationAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== playIntentNotificationPrefix || !parts[1]) {
    return null
  }

  if (parts[2] === 'join') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.JOIN
    }
  }

  if (parts[2] === 'decline') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.DECLINE
    }
  }

  if (parts[2] === 'pass') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.DECLINE
    }
  }

  return null
}

function parseMuteAction(customId: string): PlayIntentMuteAction | null {
  const parts = customId.split(':')

  if (parts.length !== 2 || parts[0] !== playIntentMutePrefix || !parts[1]) {
    return null
  }

  return {
    creatorUserId: parts[1]
  }
}

function parseScheduledCheckInAction(customId: string): ScheduledPlayIntentCheckInAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== scheduledPlayIntentCheckInPrefix || !parts[1]) {
    return null
  }

  if (parts[2] === 'confirm') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.CONFIRMED
    }
  }

  if (parts[2] === 'cancel') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.CANCELED
    }
  }

  return null
}

function parseCreatorPlayIntentSummaryAction(customId: string): CreatorPlayIntentSummaryAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== creatorPlayIntentSummaryPrefix || !parts[1]) {
    return null
  }

  if (parts[2] !== 'cancel') {
    return null
  }

  return {
    playIntentId: parts[1],
    action: 'cancel'
  }
}

function buildCreatorJoinNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  const title = notification.gameTitle
    ? `${notification.recipientDisplayName} is interested in ${notification.gameTitle}`
    : `${notification.recipientDisplayName} is interested in your call to play`
  const body = notification.gameTitle
    ? `${notification.recipientDisplayName} marked themselves as interested in your ${notification.gameTitle} call to play.`
    : `${notification.recipientDisplayName} marked themselves as interested in your call to play.`

  return {
    title,
    body
  }
}

async function applyRecipientResponseToPlayIntentNotification(options: {
  notification: ResolvablePlayIntentNotification;
  response: PlayIntentRecipientResponse;
}) {
  const { notification, response } = options

  if (!notification.playIntent) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  const playIntent = notification.playIntent
  const previousChoice = notification.responseChoice
  const creatorDiscordUserId = playIntent.user.identities?.[0]?.providerUserId ?? null
  const creatorDiscordLabel = buildDiscordUserLabel(playIntent.user.displayName, creatorDiscordUserId)

  if (response === NotificationResponseChoice.DECLINE) {
    await prisma.notification.update({
      where: {
        id: notification.id
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.DECLINE
      }
    })

    await syncCreatorPlayIntentSummaryMessages([playIntent.id])

    return {
      content: previousChoice === NotificationResponseChoice.JOIN
        ? `Understood. I marked you as passing on ${playIntent.user.displayName}'s call to play.`
        : previousChoice === NotificationResponseChoice.DECLINE
          ? 'You are still marked as passed on this call to play.'
          : buildPassAcceptedMessage(),
      discordContent: previousChoice === NotificationResponseChoice.JOIN
        ? `Understood. I marked you as passing on ${creatorDiscordLabel}'s call to play.`
        : previousChoice === NotificationResponseChoice.DECLINE
          ? 'You are still marked as passed on this call to play.'
          : buildPassAcceptedMessage()
    }
  }

  const creatorNotificationCopy = buildCreatorJoinNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: notification.game?.title ?? null
  })

  const joinResult = previousChoice !== NotificationResponseChoice.JOIN
    ? await prisma.$transaction(async (transaction) => {
        await transaction.notification.update({
          where: {
            id: notification.id
          },
          data: {
            respondedAt: new Date(),
            responseChoice: NotificationResponseChoice.JOIN
          }
        })

        return transaction.notification.create({
          data: {
            userId: playIntent.user.id,
            triggeredByUserId: notification.userId,
            playIntentId: playIntent.id,
            gameId: notification.gameId,
            type: NotificationType.SYSTEM,
            title: creatorNotificationCopy.title,
            body: creatorNotificationCopy.body
          },
          select: {
            id: true
          }
        })
      })
    : await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          respondedAt: new Date(),
          responseChoice: NotificationResponseChoice.JOIN
        },
        select: {
          id: true
        }
      })

  if (previousChoice !== NotificationResponseChoice.JOIN) {
    await prisma.notification.update({
      where: {
        id: joinResult.id
      },
      data: {
        deliveredAt: new Date()
      }
    })
  }

  await syncCreatorPlayIntentSummaryMessages([playIntent.id])

  return {
    content: previousChoice === NotificationResponseChoice.DECLINE
      ? `Nice. I marked you as interested in ${playIntent.user.displayName}'s call to play and let them know.`
      : previousChoice === NotificationResponseChoice.JOIN
        ? 'You are still marked as interested in this call to play.'
        : buildJoinAcceptedMessage(playIntent.user.displayName),
    discordContent: previousChoice === NotificationResponseChoice.DECLINE
      ? `Nice. I marked you as interested in ${creatorDiscordLabel}'s call to play and let them know.`
      : previousChoice === NotificationResponseChoice.JOIN
        ? 'You are still marked as interested in this call to play.'
        : buildJoinAcceptedMessage(creatorDiscordLabel)
  }
}

export async function respondToPlayIntentFromWeb(options: {
  userId: string;
  playIntentId: string;
  response: PlayIntentRecipientResponse;
}) {
  const notification = await prisma.notification.findFirst({
    where: {
      userId: options.userId,
      playIntentId: options.playIntentId,
      type: {
        in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER]
      }
    },
    select: {
      id: true,
      userId: true,
      gameId: true,
      responseChoice: true,
      user: {
        select: {
          displayName: true
        }
      },
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          id: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (!notification) {
    throw new PlayIntentNotificationResponseError(404, 'No active response prompt was found for this call to play.')
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  const result = await applyRecipientResponseToPlayIntentNotification({
    notification,
    response: options.response
  })

  return {
    responseChoice: options.response === NotificationResponseChoice.JOIN ? 'join' : 'decline',
    message: result.content
  }
}

export function isPlayIntentNotificationCustomId(customId: string) {
  return customId.startsWith(`${playIntentNotificationPrefix}:`) || customId.startsWith(`${playIntentMutePrefix}:`)
}

export function isPlayIntentMuteCustomId(customId: string) {
  return customId.startsWith(`${playIntentMutePrefix}:`)
}

export function isScheduledPlayIntentCheckInCustomId(customId: string) {
  return customId.startsWith(`${scheduledPlayIntentCheckInPrefix}:`)
}

export function isCreatorPlayIntentSummaryCustomId(customId: string) {
  return customId.startsWith(`${creatorPlayIntentSummaryPrefix}:`)
}

export async function sweepScheduledPlayIntentCreatorCheckIns() {
  const now = new Date()

  const candidateIntents = await prisma.playIntent.findMany({
    where: {
      windowStartsAt: {
        lte: now
      },
      windowEndsAt: {
        gt: now
      }
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      windowStartsAt: true,
      user: {
        select: {
          displayName: true
        }
      },
      notifications: {
        where: {
          type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
        },
        select: {
          id: true
        }
      }
    }
  })

  const scheduledIntents = candidateIntents.filter((intent) =>
    intent.windowStartsAt.getTime() > intent.createdAt.getTime() + 60 * 1000 && intent.notifications.length === 0
  )

  if (scheduledIntents.length === 0) {
    return
  }

  for (const intent of scheduledIntents) {
    const checkInNotification = await prisma.notification.create({
      data: {
        userId: intent.userId,
        triggeredByUserId: intent.userId,
        playIntentId: intent.id,
        type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
        title: 'Is your scheduled call to play still on?',
        body: 'Your scheduled call to play is starting now. Confirm if it is still on.'
      },
      select: {
        id: true
      }
    })

    const creatorIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: intent.userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })

    if (!creatorIdentity?.providerUserId) {
      continue
    }

    const promptCopy = buildCreatorCheckInPromptMessage(buildDiscordUserLabel(intent.user.displayName, creatorIdentity.providerUserId))

    const dmResult = (await sendDiscordDirectMessages([
      {
        discordUserId: creatorIdentity.providerUserId,
        content: promptCopy,
        components: buildScheduledPlayIntentCheckInComponents(checkInNotification.id)
      }
    ]))[0]

    if (dmResult?.status === 'sent' && !dmResult.emulated) {
      await prisma.notification.update({
        where: {
          id: checkInNotification.id
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: dmResult.channelId,
          discordDmMessageId: dmResult.messageId
        }
      })
    }

    await syncCreatorPlayIntentSummaryMessages([intent.id])
  }
}

export async function expirePendingPlayIntentNotifications(playIntentIds: string[]) {
  if (playIntentIds.length === 0) {
    return
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: playIntentIds
      },
      type: {
        in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER, NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN]
      },
      respondedAt: null
    },
    select: {
      id: true,
      type: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          user: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    }
  })

  await Promise.all(notifications.map(async (notification) => {
    const result = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.EXPIRED
      }
    })

    if (result.count === 0 || !notification.discordDmChannelId || !notification.discordDmMessageId) {
      return
    }

    const expiredContent = notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      ? buildExpiredMessage('This call to play expired before you confirmed.')
      : buildExpiredMessage(
          buildSessionEndedReason(
            buildDiscordUserLabel(
              notification.playIntent?.user.displayName ?? 'This player',
              notification.playIntent?.user.identities?.[0]?.providerUserId
            ),
            notification.game?.title ?? null
          )
        )

    await editDiscordDirectMessage({
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      content: expiredContent,
      components: [buildLinkRow()]
    })
  }))

  await syncCreatorPlayIntentSummaryMessages(playIntentIds)
}

export async function handleScheduledPlayIntentCheckInInteraction(interaction: ButtonInteraction) {
  const action = parseScheduledCheckInAction(interaction.customId)

  if (!action) {
    return
  }

  const [notification, identity] = await Promise.all([
    prisma.notification.findUnique({
      where: {
        id: action.notificationId
      },
      select: {
        id: true,
        userId: true,
        playIntentId: true,
        respondedAt: true,
        responseChoice: true,
        playIntent: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            user: {
              select: {
                displayName: true,
                identities: {
                  where: {
                    provider: AuthProvider.DISCORD
                  },
                  select: {
                    providerUserId: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!notification || !identity || identity.userId !== notification.userId) {
    await interaction.update({
      content: buildExpiredMessage('This scheduled call-to-play check-in is not available for your account anymore.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (notification.respondedAt) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(notification.responseChoice),
      components: [buildLinkRow()]
    })
    return
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('This call to play is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (action.response === NotificationResponseChoice.CANCELED) {
    const now = new Date()
    const cancellation = await prisma.$transaction(async (transaction) => {
      const cancelResult = await transaction.notification.updateMany({
        where: {
          id: notification.id,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          responseChoice: NotificationResponseChoice.CANCELED
        }
      })

      if (cancelResult.count === 0 || !notification.playIntentId) {
        return {
          notificationCanceled: cancelResult.count > 0
        }
      }

      await transaction.playIntent.updateMany({
        where: {
          id: notification.playIntentId,
          userId: notification.userId,
          expiresAt: {
            gt: now
          }
        },
        data: {
          expiresAt: now,
          windowEndsAt: now
        }
      })

      return {
        notificationCanceled: true
      }
    })

    if (cancellation.notificationCanceled && notification.playIntentId) {
      await expirePendingPlayIntentNotifications([notification.playIntentId])
    }

    await interaction.update({
      content: cancellation.notificationCanceled
        ? buildCreatorCanceledMessage()
        : buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CANCELED),
      components: [buildLinkRow()]
    })

    await syncCreatorPlayIntentSummaryMessages(notification.playIntentId ? [notification.playIntentId] : [])
    return
  }

  const playIntent = notification.playIntent
  const goTimeConfirmedCopy = buildGoTimeConfirmedCopy(playIntent.user.displayName)
  const goTimeReminderCopy = buildGoTimeReminderCopy(playIntent.user.displayName)

  const result = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.CONFIRMED
      }
    })

    if (updateResult.count === 0) {
      return null
    }

    const recipientNotifications = await transaction.notification.findMany({
      where: {
        playIntentId: playIntent.id,
        type: {
          in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER]
        },
        userId: {
          not: playIntent.userId
        }
      },
      select: {
        userId: true,
        responseChoice: true,
        respondedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const latestRecipientStatusByUserId = new Map<string, { respondedAt: Date | null; responseChoice: NotificationResponseChoice | null }>()
    for (const recipientNotification of recipientNotifications) {
      if (!latestRecipientStatusByUserId.has(recipientNotification.userId)) {
        latestRecipientStatusByUserId.set(recipientNotification.userId, {
          respondedAt: recipientNotification.respondedAt,
          responseChoice: recipientNotification.responseChoice
        })
      }
    }

    const acceptedUserIds: string[] = []
    const unansweredUserIds: string[] = []

    for (const [recipientUserId, status] of latestRecipientStatusByUserId.entries()) {
      if (status.responseChoice === NotificationResponseChoice.DECLINE) {
        continue
      }

      if (status.responseChoice === NotificationResponseChoice.JOIN) {
        acceptedUserIds.push(recipientUserId)
        continue
      }

      if (!status.respondedAt) {
        unansweredUserIds.push(recipientUserId)
      }
    }

    const confirmedNotifications = acceptedUserIds.length > 0
      ? await Promise.all(acceptedUserIds.map((recipientUserId) => transaction.notification.create({
        data: {
          userId: recipientUserId,
          triggeredByUserId: playIntent.userId,
          playIntentId: playIntent.id,
          type: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
          title: goTimeConfirmedCopy.title,
          body: goTimeConfirmedCopy.body
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          type: true
        }
      })))
      : []

    const reminderNotifications = unansweredUserIds.length > 0
      ? await Promise.all(unansweredUserIds.map((recipientUserId) => transaction.notification.create({
        data: {
          userId: recipientUserId,
          triggeredByUserId: playIntent.userId,
          playIntentId: playIntent.id,
          type: NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          title: goTimeReminderCopy.title,
          body: goTimeReminderCopy.body
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          type: true
        }
      })))
      : []

    return {
      createdNotifications: [...confirmedNotifications, ...reminderNotifications],
      priorAcceptedCount: acceptedUserIds.length
    }
  })

  if (!result) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CONFIRMED),
      components: [buildLinkRow()]
    })
    return
  }

  const [recipientIdentities, creatorIdentity] = await Promise.all([
    prisma.userIdentity.findMany({
      where: {
        provider: AuthProvider.DISCORD,
        userId: {
          in: result.createdNotifications.map((createdNotification) => createdNotification.userId)
        }
      },
      select: {
        userId: true,
        providerUserId: true
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        provider: AuthProvider.DISCORD,
        userId: playIntent.userId
      },
      select: {
        providerUserId: true
      }
    })
  ])
  const creatorDiscordUserId = creatorIdentity?.providerUserId ?? null
  const discordUserIdByUserId = new Map(recipientIdentities.map((identityEntry) => [identityEntry.userId, identityEntry.providerUserId]))

  const dmTargets = result.createdNotifications
    .map((createdNotification) => {
      const discordUserId = discordUserIdByUserId.get(createdNotification.userId)

      if (!discordUserId) {
        return null
      }

      return {
        notificationId: createdNotification.id,
        discordUserId,
        content: buildPlayIntentDirectMessage(
          createdNotification.title,
          createdNotification.body,
          creatorDiscordUserId,
          playIntent.user.displayName,
          null,
          createdNotification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER ? result.priorAcceptedCount : undefined
        ),
        components: createdNotification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
          ? buildPlayIntentNotificationComponents(createdNotification.id, playIntent.userId, playIntent.user.displayName)
          : [buildLinkRow()]
      }
    })
    .filter((target): target is { notificationId: string; discordUserId: string; content: string; components: ReturnType<typeof buildPlayIntentNotificationComponents> } => target != null)

  if (dmTargets.length > 0) {
    const dmResults = await sendDiscordDirectMessages(
      dmTargets.map((target) => ({
        discordUserId: target.discordUserId,
        content: target.content,
        components: target.components
      }))
    )

    const deliveredTargets = dmTargets
      .map((target) => {
        const sentResult = dmResults.find((candidate) => candidate.discordUserId === target.discordUserId && candidate.status === 'sent')

        return sentResult && !sentResult.emulated
          ? {
              notificationId: target.notificationId,
              channelId: sentResult.channelId,
              messageId: sentResult.messageId
            }
          : null
      })
      .filter((target): target is { notificationId: string; channelId: string | null; messageId: string | null } => target != null)

    await Promise.all(deliveredTargets.map((target) => prisma.notification.update({
      where: {
        id: target.notificationId
      },
      data: {
        deliveredAt: new Date(),
        discordDmChannelId: target.channelId,
        discordDmMessageId: target.messageId
      }
    })))
  }

  await interaction.update({
    content: buildCreatorConfirmedMessage(),
    components: [buildLinkRow()]
  })

  await syncCreatorPlayIntentSummaryMessages([playIntent.id])
}

export async function handlePlayIntentNotificationInteraction(interaction: ButtonInteraction) {
  const muteAction = parseMuteAction(interaction.customId)
  if (muteAction) {
    await handlePlayIntentMuteInteraction(interaction, muteAction)
    return
  }

  const action = parseAction(interaction.customId)

  if (!action) {
    return
  }

  const [notification, identity] = await Promise.all([
    prisma.notification.findUnique({
      where: {
        id: action.notificationId
      },
      select: {
        id: true,
        userId: true,
        triggeredByUserId: true,
        playIntentId: true,
        gameId: true,
        respondedAt: true,
        responseChoice: true,
        user: {
          select: {
            displayName: true
          }
        },
        game: {
          select: {
            title: true
          }
        },
        playIntent: {
          select: {
            id: true,
            userId: true,
            headline: true,
            selectionMode: true,
            expiresAt: true,
            user: {
              select: {
                id: true,
                displayName: true,
                identities: {
                  where: {
                    provider: AuthProvider.DISCORD
                  },
                  select: {
                    providerUserId: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!notification || !identity || identity.userId !== notification.userId) {
    await interaction.update({
      content: buildExpiredMessage('This prompt is not available for your account anymore.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (!notification.playIntentId || !notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('The original call to play is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  const playIntent = notification.playIntent
  const result = await applyRecipientResponseToPlayIntentNotification({
    notification,
    response: action.response
  })

  await interaction.update({
    content: result.discordContent ?? result.content,
    components: buildPlayIntentNotificationComponents(notification.id, playIntent.user.id, playIntent.user.displayName)
  })
}

async function handlePlayIntentMuteInteraction(interaction: ButtonInteraction, action: PlayIntentMuteAction) {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: interaction.user.id
      }
    },
    select: {
      userId: true
    }
  })

  if (!identity) {
    await interaction.update({
      content: 'Unable to verify your account. Please sign in to Game\'s Up.',
      components: [buildLinkRow()]
    })
    return
  }

  const creatorUser = await prisma.user.findUnique({
    where: {
      id: action.creatorUserId
    },
    select: {
      displayName: true,
      id: true,
      identities: {
        where: {
          provider: AuthProvider.DISCORD
        },
        select: {
          providerUserId: true
        }
      }
    }
  })

  if (!creatorUser) {
    await interaction.update({
      content: 'This player was not found.',
      components: [buildLinkRow()]
    })
    return
  }

  const existingMute = await prisma.playIntentMute.findUnique({
    where: {
      userId_mutedUserId: {
        userId: identity.userId,
        mutedUserId: action.creatorUserId
      }
    }
  })

  if (!existingMute) {
    await prisma.playIntentMute.create({
      data: {
        userId: identity.userId,
        mutedUserId: action.creatorUserId
      }
    })
  }

  await interaction.update({
    content: `Muted ${buildDiscordUserLabel(creatorUser.displayName, creatorUser.identities[0]?.providerUserId)}'s CTPs. You won't see their calls to play in your feed.`,
    components: [buildLinkRow()]
  })
}

export async function handleCreatorPlayIntentSummaryInteraction(interaction: ButtonInteraction) {
  const action = parseCreatorPlayIntentSummaryAction(interaction.customId)

  if (!action) {
    return
  }

  const [playIntent, identity] = await Promise.all([
    prisma.playIntent.findUnique({
      where: {
        id: action.playIntentId
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!playIntent || !identity || identity.userId !== playIntent.userId) {
    await interaction.update({
      content: 'This CTP summary is not available for your account anymore.',
      components: [buildLinkRow()]
    })
    return
  }

  if (playIntent.expiresAt > new Date()) {
    const now = new Date()

    await prisma.playIntent.update({
      where: {
        id: playIntent.id
      },
      data: {
        expiresAt: now,
        windowEndsAt: now
      }
    })

    await expirePendingPlayIntentNotifications([playIntent.id])
  } else {
    await syncCreatorPlayIntentSummaryMessages([playIntent.id])
  }

  const refreshedSnapshot = await getCreatorPlayIntentSummarySnapshot(playIntent.id)

  await interaction.update({
    content: refreshedSnapshot ? buildCreatorPlayIntentSummaryMessage(refreshedSnapshot) : 'This call to play is already closed.',
    components: [buildLinkRow()]
  })
}