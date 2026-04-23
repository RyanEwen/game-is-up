import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions
} from 'discord.js'
import {
  AuthProvider,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  type Prisma
} from '@prisma/client'
import {
  archivePlayIntentDirectMessages,
  buildArchivedAudienceCleanupComponents,
  buildArchivedPlayIntentEmbeds,
  deleteReplyMessagesReferencingTargets,
  deleteCreatorPlayIntentDirectMessages,
  deleteUserPlayIntentDirectMessages
} from './discord-dm-cleanup.js'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  sendDiscordDirectMessages,
  type DiscordDirectMessagePayload,
  supportsDiscordInteractiveMessages
} from './discord-bot-runtime.js'
import {
  isMissingDiscordMessageError,
  syncTrackedDiscordDirectMessage
} from './discord-tracked-direct-message.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import {
  appendOpenInAppButton,
  buildDiscordBulletSection,
  buildDiscordMessageHeading,
  buildDiscordPlainMessage,
  buildDiscordSection,
  buildDiscordSubtext,
  buildOpenInAppButton,
  formatLabeledDiscordLines
} from './discord-dm-formatting.js'
import { toClientGameCoverUrl } from './game-media.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  callToPlayEndedSystemNotification,
  creatorInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification,
  formatCreatorInterestUpdateSystemNotification,
  formatCreatorInterestWithdrawnSystemNotification,
  getPlayIntentSystemNotificationDefinitionByTitle
} from './play-intent-system-notifications.js'
import { buildClientPlayIntentUrl, buildClientPlayUrl } from './play-intent-urls.js'
import {
  deletePlayIntentDiscordSpaceByPlayIntentId,
  getPlayIntentDiscordSpaceRecipientContexts,
  markPlayIntentDiscordSpaceInviteSent,
  markPlayIntentDiscordSpacesRetained,
  type PlayIntentDiscordSpaceRecipientContext
} from './play-intent-discord-spaces.js'
import { resolveNotificationDirectMessageRenderState } from './play-intent-notification-render-state.js'
import {
  resolveRecipientResponseTransition
} from './play-intent-recipient-response-transition.js'
import { prisma } from './prisma.js'
import { formatPlayIntentDateLabel, formatPlayIntentWindowLabel } from './play-intent-time-format.js'

const playIntentNotificationPrefix = 'play-intent-response'
const playIntentMutePrefix = 'play-intent-mute'
const scheduledPlayIntentCheckInPrefix = 'scheduled-play-intent-check-in'
const creatorPlayIntentSummaryPrefix = 'creator-play-intent-summary'

type PlayIntentNotificationAction = {
  notificationId: string;
  response: PlayIntentRecipientResponse;
}

type PlayIntentCleanupAction = {
  notificationId: string;
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
  action: 'start-now' | 'end' | 'cleanup' | 'delete-space';
}

type PlayIntentRecipientResponse = 'JOIN' | 'DECLINE'

type DirectMessagePreviewPayload = {
  content: string;
  embeds?: MessageCreateOptions['embeds'];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

type PassAcknowledgementMode = 'anonymous' | 'creator-notified'

type ResolvablePlayIntentNotification = {
  id: string;
  userId: string;
  gameId: string | null;
  responseChoice: NotificationResponseChoice | null;
  recipientResponseDiscordDmChannelId?: string | null;
  recipientResponseDiscordDmMessageId?: string | null;
  user: {
    displayName: string;
    identities?: { providerUserId: string }[];
  };
  game: {
    title: string;
  } | null;
  playIntent: {
    id: string;
    scope: PlayIntentScope;
    user: {
      id: string;
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  } | null;
}

type ScheduledGoTimePlayIntentSnapshot = {
  id: string;
  userId: string;
  scope: PlayIntentScope;
  headline: string;
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  note: string;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  user: {
    displayName: string;
    identities: Array<{
      providerUserId: string;
    }>;
  };
  targetDiscordServers: {
    server: {
      name: string;
    };
  }[];
  targetFriends: {
    friendUser: {
      displayName: string;
      identities: Array<{
        providerUserId: string;
      }>;
    };
  }[];
  games: {
    game: {
      title: string;
    };
  }[];
}

type CreatedScheduledGoTimeNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  replyToInviteChannelId: string | null;
  replyToInviteMessageId: string | null;
}

type ScheduledGoTimeAudienceNotificationResult = {
  createdNotifications: CreatedScheduledGoTimeNotification[];
  priorAcceptedCount: number;
  acceptedUserIds: string[];
}

function notificationUsesInviteOwnedAudienceResponseThread(notificationType: NotificationType) {
  return notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
    || notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
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
  discordSpace: {
    status: 'REQUESTED' | 'PROVISIONING' | 'ACTIVE' | 'RETAINED' | 'DELETE_REQUESTED' | 'DELETED' | 'PROVISION_FAILED';
    textChannelName: string | null;
    textChannelUrl: string | null;
    voiceChannelName: string | null;
    voiceChannelUrl: string | null;
    inviteUrl: string | null;
    deleteAfter: Date | null;
  } | null;
  user: {
    id: string;
    displayName: string;
    timezoneId: string;
    identities: { providerUserId: string }[];
  };
  targetDiscordServers: {
    server: {
      name: string;
    };
  }[];
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
    user?: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
}

type PlayIntentAudienceTargetServer = {
  server: {
    name: string;
  };
}

type PlayIntentAudienceTargetFriend = {
  friendUser: {
    displayName: string;
    identities?: { providerUserId: string }[];
  };
}

type RecipientPlayIntentDetails = {
  headline?: string | null;
  selectionMode?: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES' | 'library' | 'subset' | null;
  selectedGameTitles?: string[];
  scope?: PlayIntentScope | null;
  targetDiscordServers?: PlayIntentAudienceTargetServer[];
  targetFriends?: PlayIntentAudienceTargetFriend[];
  note?: string | null;
}

const defaultPlayIntentHeadline = 'Call to play'

type ExpirePendingPlayIntentNotificationsOptions = {
  notifyAudienceOnEnd?: boolean;
  publishInvalidation?: boolean;
}

export class PlayIntentNotificationResponseError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'PlayIntentNotificationResponseError'
  }
}

function buildPlayAppUrl(playIntentId?: string) {
  return playIntentId ? buildClientPlayIntentUrl(playIntentId) : buildClientPlayUrl()
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

function buildLinkRow(playIntentId?: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildOpenInAppButton(buildPlayAppUrl(playIntentId), playIntentId ? 'Open in App' : 'Open App')
  )
}

async function createScheduledGoTimeAudienceNotifications(
  transaction: Prisma.TransactionClient,
  playIntent: Pick<ScheduledGoTimePlayIntentSnapshot, 'id' | 'userId' | 'user'>
): Promise<ScheduledGoTimeAudienceNotificationResult> {
  const goTimeConfirmedCopy = buildGoTimeConfirmedCopy(playIntent.user.displayName)
  const goTimeReminderCopy = buildGoTimeReminderCopy(playIntent.user.displayName)
  const recipientNotifications = await transaction.notification.findMany({
    where: {
      playIntentId: playIntent.id,
      type: {
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      },
      userId: {
        not: playIntent.userId
      }
    },
    select: {
      userId: true,
      type: true,
      responseChoice: true,
      respondedAt: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const latestRecipientStatusByUserId = new Map<string, { respondedAt: Date | null; responseChoice: NotificationResponseChoice | null }>()
  const latestInviteMessageByUserId = new Map<string, { channelId: string; messageId: string }>()

  for (const recipientNotification of recipientNotifications) {
    if (!latestRecipientStatusByUserId.has(recipientNotification.userId)) {
      latestRecipientStatusByUserId.set(recipientNotification.userId, {
        respondedAt: recipientNotification.respondedAt,
        responseChoice: recipientNotification.responseChoice
      })
    }

    if (
      recipientNotification.type === NotificationType.FRIEND_PLAYING
      && recipientNotification.discordDmChannelId
      && recipientNotification.discordDmMessageId
      && !latestInviteMessageByUserId.has(recipientNotification.userId)
    ) {
      latestInviteMessageByUserId.set(recipientNotification.userId, {
        channelId: recipientNotification.discordDmChannelId,
        messageId: recipientNotification.discordDmMessageId
      })
    }
  }

  const mutedRecipientUserIds = new Set((await transaction.playIntentMute.findMany({
    where: {
      mutedUserId: playIntent.userId,
      userId: {
        in: [...latestRecipientStatusByUserId.keys()]
      }
    },
    select: {
      userId: true
    }
  })).map((mute) => mute.userId))

  const acceptedUserIds: string[] = []
  const unansweredUserIds: string[] = []

  for (const [recipientUserId, status] of latestRecipientStatusByUserId.entries()) {
    if (status.responseChoice === NotificationResponseChoice.DECLINE || mutedRecipientUserIds.has(recipientUserId)) {
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
    ? (await Promise.all(acceptedUserIds.map((recipientUserId) => transaction.notification.create({
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
    })))).map((notification) => ({
      ...notification,
      replyToInviteChannelId: latestInviteMessageByUserId.get(notification.userId)?.channelId ?? null,
      replyToInviteMessageId: latestInviteMessageByUserId.get(notification.userId)?.messageId ?? null
    }))
    : []

  const reminderNotifications = unansweredUserIds.length > 0
    ? (await Promise.all(unansweredUserIds.map((recipientUserId) => transaction.notification.create({
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
    })))).map((notification) => ({
      ...notification,
      replyToInviteChannelId: latestInviteMessageByUserId.get(notification.userId)?.channelId ?? null,
      replyToInviteMessageId: latestInviteMessageByUserId.get(notification.userId)?.messageId ?? null
    }))
    : []

  return {
    createdNotifications: [...confirmedNotifications, ...reminderNotifications],
    priorAcceptedCount: acceptedUserIds.length,
    acceptedUserIds
  }
}

async function deliverScheduledGoTimeAudienceNotifications(options: {
  playIntent: ScheduledGoTimePlayIntentSnapshot;
  result: ScheduledGoTimeAudienceNotificationResult;
}) {
  const { playIntent, result } = options

  if (result.createdNotifications.length === 0) {
    return
  }

  const [recipientIdentities, creatorIdentity, creatorMemberships] = await Promise.all([
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
    }),
    playIntent.voiceChannelId
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: playIntent.userId
          },
          select: {
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ serverId: string }>)
  ])

  const creatorDiscordUserId = creatorIdentity?.providerUserId ?? null
  const discordUserIdByUserId = new Map(recipientIdentities.map((identityEntry) => [identityEntry.userId, identityEntry.providerUserId]))
  const creatorServerIds = creatorMemberships.map((membership) => membership.serverId)
  const discordSpaceRecipientContexts = await getPlayIntentDiscordSpaceRecipientContexts(
    playIntent.id,
    result.createdNotifications.map((createdNotification) => createdNotification.userId)
  )
  const recipientServerMemberships = playIntent.voiceChannelId && creatorServerIds.length > 0
    ? await prisma.discordServerMembership.findMany({
        where: {
          userId: {
            in: result.createdNotifications.map((createdNotification) => createdNotification.userId)
          },
          serverId: {
            in: creatorServerIds
          }
        },
        select: {
          userId: true
        }
      })
    : []
  const recipientUserIdsWithSharedServer = new Set(recipientServerMemberships.map((membership) => membership.userId))

  const dmTargets = result.createdNotifications
    .flatMap((createdNotification) => {
      const discordUserId = discordUserIdByUserId.get(createdNotification.userId)

      if (!discordUserId) {
        return []
      }

      const voiceChannel = playIntent.voiceChannelId || playIntent.voiceChannelName
        ? {
            channelId: playIntent.voiceChannelId ?? null,
            channelName: playIntent.voiceChannelName ?? null,
            recipientSharesServer: recipientUserIdsWithSharedServer.has(createdNotification.userId)
          }
        : null

      return [{
        notificationId: createdNotification.id,
        discordUserId,
        content: createdNotification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
          ? buildGoTimeReminderReplyMessage({
              creatorDiscordUserId,
              creatorDisplayName: playIntent.user.displayName
            })
          : buildGoTimeConfirmedReplyMessage({
              creatorDiscordUserId,
              creatorDisplayName: playIntent.user.displayName,
              voiceChannel,
              discordSpace: discordSpaceRecipientContexts.get(createdNotification.userId) ?? null
            }),
        embeds: undefined,
        components: [],
        replyTo: createdNotification.replyToInviteMessageId
          ? {
              channelId: createdNotification.replyToInviteChannelId,
              messageId: createdNotification.replyToInviteMessageId
            }
          : undefined
      }]
    })

  if (dmTargets.length > 0) {
    const dmResults = await sendDiscordDirectMessages(
      dmTargets.map((target) => ({
        discordUserId: target.discordUserId,
        content: target.content,
        embeds: target.embeds,
        components: target.components,
        replyTo: target.replyTo
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
}

function buildCreatorSummaryActionRow(playIntentId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:end`)
      .setLabel('End call to play')
      .setStyle(ButtonStyle.Danger)
  )
}

function buildCreatorSummaryScheduledActionRow(playIntentId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:start-now`)
      .setLabel('Start now')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:end`)
      .setLabel('End call to play')
      .setStyle(ButtonStyle.Danger)
  )
}

function buildCreatorSummaryCleanupRow(playIntentId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:cleanup`)
      .setLabel('Archive')
      .setStyle(ButtonStyle.Secondary)
  )
}

function buildCreatorSummaryDeleteSpaceButton(playIntentId: string) {
  return new ButtonBuilder()
    .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:delete-space`)
    .setLabel('Delete Discord channel')
    .setStyle(ButtonStyle.Danger)
}

function buildResponseRow(
  notificationId: string,
  responseChoice?: NotificationResponseChoice | null,
  notificationType: NotificationType = NotificationType.FRIEND_PLAYING,
  responseCustomIdBuilder?: (response: 'interested' | 'pass') => string
) {
  const buttons: MessageActionRowComponentBuilder[] = []
  const isGoTimeConfirmed = notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED

  if (!isGoTimeConfirmed && responseChoice !== NotificationResponseChoice.JOIN) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(responseCustomIdBuilder?.('interested') ?? `${playIntentNotificationPrefix}:${notificationId}:interested`)
        .setLabel('I\'m interested')
        .setStyle(ButtonStyle.Primary)
    )
  }

  if (responseChoice !== NotificationResponseChoice.DECLINE) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(responseCustomIdBuilder?.('pass') ?? `${playIntentNotificationPrefix}:${notificationId}:pass`)
        .setLabel(isGoTimeConfirmed ? 'No longer interested' : 'Pass')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  if (buttons.length === 0) {
    return null
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)
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

function buildMuteButton(creatorUserId: string, creatorDisplayName: string) {
  return new ButtonBuilder()
    .setCustomId(`${playIntentMutePrefix}:${creatorUserId}`)
    .setLabel(buildMuteLabel(creatorDisplayName))
    .setStyle(ButtonStyle.Danger)
}

function buildMuteRow(creatorUserId: string, creatorDisplayName: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildMuteButton(creatorUserId, creatorDisplayName)
  )
}

function buildScheduledCheckInResponseRow(notificationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:confirm`)
      .setLabel('Still on')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:end`)
      .setLabel('End call to play')
      .setStyle(ButtonStyle.Secondary)
  )
}

function buildDirectMessageSectionHeading(label: string) {
  switch (label.trim().toLowerCase()) {
    case 'creator':
      return '### 👤 Creator'
    case 'title':
      return '### 📝 Title'
    case 'games':
      return '### 🎯 Games'
    case 'timing':
    case 'when':
      return '### ⏰ Timing'
    case 'audience':
      return '### 👥 Audience'
    case 'window':
      return '### 🗓 Window'
    case 'voice channel':
      return '### 🎙 Voice Channel'
    case 'interest':
      return '### 👥 Interest'
    case 'status':
      return '### 📡 Status'
    case 'note':
      return '### 🗒 Note'
    case 'confirmed interested':
      return '### 🙋 Interested Players'
    case 'reach':
      return '### 📬 Reach'
    default:
      return `### ${label.trim()}`
  }
}

const directMessageLineFormatting = {
  quotedLabels: ['update'],
  subtextLabels: ['reply']
}

function formatDirectMessageField(label: string, value: string) {
  return buildDiscordSection(label, value, buildDirectMessageSectionHeading, directMessageLineFormatting)
}

function formatLabeledDirectMessageLines(text: string) {
  return formatLabeledDiscordLines(text, buildDirectMessageSectionHeading, directMessageLineFormatting)
}

function buildDirectMessageBulletSection(label: string, items: string[]) {
  return buildDiscordBulletSection(label, items, buildDirectMessageSectionHeading)
}

const dmEmbedColors = {
  info: 0x3b82f6,
  warning: 0xf59e0b,
  success: 0x22c55e,
  danger: 0xef4444,
  neutral: 0x64748b
} as const

type AudiencePlayIntentSummaryStatus = 'scheduled' | 'live'

function resolveAudiencePlayIntentSummaryStatus(startsAt: Date, currentTime = new Date()): AudiencePlayIntentSummaryStatus {
  return startsAt.getTime() > currentTime.getTime() + 60 * 1000 ? 'scheduled' : 'live'
}

function resolveAudiencePlayIntentSummaryColor(status: AudiencePlayIntentSummaryStatus) {
  return status === 'scheduled' ? dmEmbedColors.info : dmEmbedColors.success
}

type DiscordEmbedFieldInput = {
  name: string;
  value: string | null | undefined;
  inline?: boolean;
}

function sanitizeDiscordEmbedValue(value: string) {
  return value.trim().slice(0, 1024)
}

function buildDiscordEmbedFields(fields: DiscordEmbedFieldInput[]) {
  return fields.flatMap((field) => {
    const trimmedValue = field.value?.trim()

    if (!trimmedValue) {
      return []
    }

    return [{
      name: field.name,
      value: sanitizeDiscordEmbedValue(trimmedValue),
      inline: false
    }]
  })
}

function formatPlayIntentEmbedFieldName(label: string) {
  switch (label.trim().toLowerCase()) {
    case 'creator':
      return '👤 Creator'
    case 'title':
      return '📝 Title'
    case 'games':
      return '🎯 Games'
    case 'timing':
    case 'when':
      return '⏰ Timing'
    case 'audience':
      return '👥 Audience'
    case 'window':
      return '🗓 Window'
    case 'voice channel':
      return '🎙 Voice Channel'
    case 'interest':
      return '👥 Interest'
    case 'status':
      return '📡 Status'
    case 'note':
      return '🗒 Note'
    case 'interested players':
    case 'confirmed interested':
      return '🙋 Interested Players'
    case 'responses':
      return '🧾 Responses'
    case 'reach':
      return '📬 Reach'
    default:
      return label.trim()
  }
}

export function buildPlayIntentDirectMessageHeading(
  title: string
) {
  return buildDiscordMessageHeading(`🎮 ${title}`)
}

export function buildDiscordInviteReplyPayload(options: {
  discordUserId: string;
  inviteUrl: string | null | undefined;
  replyTo?: DiscordDirectMessagePayload['replyTo'];
}): DiscordDirectMessagePayload | null {
  const trimmedInviteUrl = options.inviteUrl?.trim()

  if (!trimmedInviteUrl || !options.replyTo) {
    return null
  }

  return {
    discordUserId: options.discordUserId,
    content: trimmedInviteUrl,
    components: [],
    replyTo: options.replyTo
  }
}

function extractLabeledFields(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const labeledMatch = /^([A-Za-z][A-Za-z ]{0,40}):\s+(.+)$/.exec(line)

      if (!labeledMatch || !labeledMatch[1] || !labeledMatch[2]) {
        return []
      }

      return [{
        label: labeledMatch[1].trim(),
        value: labeledMatch[2].trim()
      }]
    })
}

function summarizePlayIntentAudience(
  scope: PlayIntentScope | null | undefined,
  targetDiscordServers: PlayIntentAudienceTargetServer[] = [],
  targetFriends: PlayIntentAudienceTargetFriend[] = []
) {
  if (scope === 'SPECIFIC_DISCORD_SERVER' && targetDiscordServers.length > 0) {
    const names = targetDiscordServers
      .map((entry) => entry.server.name)
      .sort((left, right) => left.localeCompare(right))

    if (names.length <= 4) {
      return `Discord servers ${names.join(', ')}`
    }

    return `Discord servers ${names.slice(0, 4).join(', ')} +${names.length - 4} more`
  }

  if (scope === 'SPECIFIC_FRIENDS') {
    const names = targetFriends
      .map((entry) => buildDiscordUserLabel(entry.friendUser.displayName, entry.friendUser.identities?.[0]?.providerUserId))
      .sort((left, right) => left.localeCompare(right))

    if (names.length <= 4) {
      return `Specific friends (${names.join(', ')})`
    }

    return `Specific friends (${names.slice(0, 4).join(', ')} +${names.length - 4} more)`
  }

  if (scope === 'MUTUAL_FRIENDS') {
    return 'Friends and your selected network'
  }

  if (scope === 'FRIENDS_ONLY') {
    return 'Friends only'
  }

  return null
}

function summarizePlayIntentGames(
  selectionMode: RecipientPlayIntentDetails['selectionMode'],
  selectedGameTitles: string[] = []
) {
  if (selectionMode === 'ENTIRE_LIBRARY' || selectionMode === 'library') {
    return 'Any game in their library that is also in yours.'
  }

  const titles = [...selectedGameTitles].sort((left, right) => left.localeCompare(right))

  if (titles.length === 0) {
    return null
  }

  if (titles.length <= 4) {
    return titles.join(', ')
  }

  return `${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function buildRecipientDiscordSpaceChannelReference(options: {
  channelUrl?: string | null;
  channelName?: string | null;
  recipientInServer: boolean;
}) {
  if (options.recipientInServer) {
    return options.channelUrl ?? options.channelName ?? null
  }

  return options.channelName ?? options.channelUrl ?? null
}

function buildRecipientVoiceChannelValue(
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null
) {
  const selectedVoiceChannelValue = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `<#${voiceChannel.channelId}>`
      : voiceChannel.channelName
    : null

  const temporaryVoiceChannelValue = discordSpace
    ? buildRecipientDiscordSpaceChannelReference({
        channelUrl: discordSpace.voiceChannelUrl,
        channelName: discordSpace.voiceChannelName,
        recipientInServer: discordSpace.recipientInServer
      })
    : null

  const textChannelValue = discordSpace
    ? buildRecipientDiscordSpaceChannelReference({
        channelUrl: discordSpace.textChannelUrl,
        channelName: discordSpace.textChannelName,
        recipientInServer: discordSpace.recipientInServer
      })
    : null

  return [
    discordSpace
      ? `Status: ${formatDiscordSpaceStatusLabel(discordSpace.status.toUpperCase() as 'ACTIVE' | 'RETAINED' | 'DELETE_REQUESTED')}`
      : null,
    textChannelValue
      ? `Text channel: ${textChannelValue}`
      : null,
    selectedVoiceChannelValue || temporaryVoiceChannelValue
      ? `Voice channel: ${selectedVoiceChannelValue ?? temporaryVoiceChannelValue}`
      : (discordSpace ? 'Voice channel: The Discord channel will appear after you join the Game\'s Up Discord server.' : null),
    discordSpace?.inviteUrl
      ? `Invite link (shareable): ${discordSpace.inviteUrl}`
      : null
  ].filter((part): part is string => Boolean(part)).join('\n') || null
}

function buildInterestFieldValue(interestedCount?: number, interestedUserLabels?: string[]) {
  const resolvedInterestedCount = interestedUserLabels?.length ?? interestedCount ?? 0

  if (resolvedInterestedCount <= 0) {
    return 'No one is showing interest yet.'
  }

  return [
    `${resolvedInterestedCount} ${resolvedInterestedCount === 1 ? 'person is' : 'people are'} showing interest:`,
    interestedUserLabels && interestedUserLabels.length > 0
      ? formatInterestedUserLabelSummary(interestedUserLabels)
      : null
  ].filter((part): part is string => Boolean(part)).join('\n')
}

function formatUpdatedFieldChange(field: string) {
  switch (field) {
    case 'time':
      return 'Timing changed.'
    case 'game selection':
      return 'Games changed.'
    case 'audience':
      return 'Audience changed.'
    case 'note':
      return 'Note changed.'
    case 'temporary Discord channel':
      return 'Voice channel changed.'
    default:
      return `${field.charAt(0).toUpperCase()}${field.slice(1)} changed.`
  }
}

export function buildPlayIntentUpdatedReplyMessage(
  updatedFields: string[],
  options: {
    requiresFreshResponse?: boolean;
  } = {}
) {
  return buildDiscordPlainMessage(
    buildDiscordMessageHeading('ℹ️ Call Updated'),
    [
      ...updatedFields.map(formatUpdatedFieldChange),
      options.requiresFreshResponse
        ? 'Your previous response was cleared because the timing or game selection changed.'
        : null
    ],
    {
      trailingSubtext: options.requiresFreshResponse
        ? 'Use the buttons on the original invite above to respond again.'
        : 'The original invite above now shows the latest details.'
    }
  )
}

export function buildGoTimeReminderReplyMessage(options: {
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
}) {
  const creatorLabel = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'The creator'

  return buildDiscordPlainMessage(
    buildDiscordMessageHeading('⏰ Go Time'),
    [
      `${creatorLabel} confirmed this session is still on.`
    ],
    {
      trailingSubtext: 'See original invite above for details or to change your response.'
    }
  )
}

export function buildGoTimeConfirmedReplyMessage(options: {
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null;
}) {
  const creatorLabel = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'The creator'

  return buildDiscordPlainMessage(
    buildDiscordMessageHeading('⏰ Go Time'),
    [
      `${creatorLabel} confirmed the session is starting now.`,
      'See original invite above for details or to change your response.'
    ],
    {}
  )
}

function resolveRecipientPlayIntentHeadline(headline: string | null | undefined) {
  const trimmedHeadline = headline?.trim() ?? ''

  if (!trimmedHeadline || trimmedHeadline === defaultPlayIntentHeadline) {
    return null
  }

  return trimmedHeadline
}

export function buildPlayIntentDirectMessageEmbeds(
  _title: string,
  body: string,
  creatorDiscordUserId?: string | null,
  creatorDisplayName?: string | null,
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  interestedCount?: number,
  interestedUserLabels?: string[],
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null,
  options: {
    includeUpdateDescription?: boolean;
    intentDetails?: RecipientPlayIntentDetails;
    summaryStatus?: AudiencePlayIntentSummaryStatus;
    showVoiceChannel?: boolean;
  } = {}
) {
  const creatorLabel = creatorDisplayName
    ? buildDiscordUserLabel(creatorDisplayName, creatorDiscordUserId)
    : null
  const titleValue = resolveRecipientPlayIntentHeadline(options.intentDetails?.headline)
  const replacedBody = creatorDisplayName
    ? replaceDisplayNameWithMention(body, creatorDisplayName, creatorDiscordUserId)
    : body
  const fieldsFromBody = extractLabeledFields(replacedBody)
  const updateField = fieldsFromBody.find((field) => field.label.trim().toLowerCase() === 'update')
  const timingField = fieldsFromBody.find((field) => {
    const normalizedLabel = field.label.trim().toLowerCase()

    return normalizedLabel === 'when' || normalizedLabel === 'timing'
  })
  const bodyGamesField = fieldsFromBody.find((field) => field.label.trim().toLowerCase() === 'games')
  const bodyAudienceField = fieldsFromBody.find((field) => field.label.trim().toLowerCase() === 'audience')
  const bodyNoteField = fieldsFromBody.find((field) => field.label.trim().toLowerCase() === 'note')
  const gamesValue = options.intentDetails
    ? summarizePlayIntentGames(options.intentDetails.selectionMode, options.intentDetails.selectedGameTitles)
    : (bodyGamesField?.value ?? null)
  const audienceValue = options.intentDetails
    ? summarizePlayIntentAudience(
        options.intentDetails.scope,
        options.intentDetails.targetDiscordServers,
        options.intentDetails.targetFriends
      )
    : (bodyAudienceField?.value ?? null)
  const noteValue = options.intentDetails?.note?.trim() || bodyNoteField?.value || null
  const voiceChannelValue = options.showVoiceChannel
    ? buildRecipientVoiceChannelValue(voiceChannel, discordSpace)
    : null
  const summaryDescription = [
    titleValue,
    (options.includeUpdateDescription ?? true) ? updateField?.value ?? null : null
  ].filter((value): value is string => Boolean(value)).join('\n\n')
  const summaryStatus = options.summaryStatus ?? 'scheduled'
  const embed = new EmbedBuilder()
    .setColor(resolveAudiencePlayIntentSummaryColor(summaryStatus))
    .setDescription(summaryDescription || null)
    .addFields(buildDiscordEmbedFields([
      {
        name: formatPlayIntentEmbedFieldName('Creator'),
        value: creatorLabel,
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Games'),
        value: gamesValue,
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Timing'),
        value: timingField?.value ?? null,
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Audience'),
        value: audienceValue,
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Interest'),
        value: buildInterestFieldValue(interestedCount, interestedUserLabels),
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Note'),
        value: noteValue,
        inline: false
      },
      {
        name: formatPlayIntentEmbedFieldName('Voice Channel'),
        value: voiceChannelValue,
        inline: false
      }
    ]))
    .setFooter({ text: 'Respond from the buttons below or open the app.' })

  return [
    embed
  ]
}

function buildScheduledCheckInEmbeds(creatorLabel: string) {
  return [
    new EmbedBuilder()
      .setColor(dmEmbedColors.warning)
      .setDescription(`Your scheduled call to play is starting now, ${creatorLabel}.`)
      .addFields(buildDiscordEmbedFields([
        {
          name: formatPlayIntentEmbedFieldName('Status'),
          value: 'Confirm if it is still on, or end the call if plans changed.',
          inline: false
        }
      ]))
      .setFooter({ text: 'Use the buttons below for the fastest response.' })
  ]
}

export function buildPlayIntentDirectMessage(
  title: string,
  body: string,
  creatorDiscordUserId?: string | null,
  creatorDisplayName?: string | null,
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  interestedCount?: number,
  interestedUserLabels?: string[],
  includeInterestPrompt = true
) {
  const titleWithCreatorMention = creatorDisplayName
    ? replaceDisplayNameWithMention(title, creatorDisplayName, creatorDiscordUserId)
    : title
  const replacedBody = creatorDisplayName
    ? replaceDisplayNameWithMention(body, creatorDisplayName, creatorDiscordUserId)
    : body

  const voiceChannelValue = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `<#${voiceChannel.channelId}>`
      : voiceChannel.channelName
    : null

  const interestSection = buildDirectMessageBulletSection('Interest', [
    interestedCount && interestedCount > 0
      ? `${interestedCount} ${interestedCount === 1 ? 'person is' : 'people are'} showing interest:`
      : '',
    interestedUserLabels && interestedUserLabels.length > 0
      ? formatInterestedUserLabelSummary(interestedUserLabels)
      : ''
  ])

  const responseSubtext = includeInterestPrompt
    ? supportsDiscordInteractiveMessages()
      ? buildDiscordSubtext('Use the buttons below to answer.')
      : buildDiscordSubtext('Open the app to say whether you\'re interested.')
    : null

  const postedByQuote = creatorDiscordUserId
    && !titleWithCreatorMention.includes(`<@${creatorDiscordUserId}>`)
    && !replacedBody.includes(`<@${creatorDiscordUserId}>`)
    ? `> Posted by <@${creatorDiscordUserId}>`
    : null

  return [
    buildPlayIntentDirectMessageHeading(title),
    postedByQuote,
    ...formatLabeledDirectMessageLines(replacedBody),
    ...(voiceChannelValue ? [formatDirectMessageField('Voice channel', voiceChannelValue)] : []),
    interestSection,
    responseSubtext
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildPlayIntentNotificationComponents(
  notificationId: string,
  creatorUserId?: string,
  creatorDisplayName?: string,
  responseChoice?: NotificationResponseChoice | null,
  notificationType: NotificationType = NotificationType.FRIEND_PLAYING,
  options: {
    forceInteractive?: boolean;
    playIntentId?: string;
    responseCustomIdBuilder?: (response: 'interested' | 'pass') => string;
  } = {}
) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  const responseRow = buildResponseRow(
    notificationId,
    responseChoice,
    notificationType,
    options.responseCustomIdBuilder
  )

  if (responseRow) {
    rows.push(responseRow)
  }

  if (responseChoice === NotificationResponseChoice.DECLINE && creatorUserId && creatorDisplayName) {
    const firstRowComponentCount = responseRow?.toJSON().components?.length ?? 0

    if (responseRow && firstRowComponentCount < 5) {
      responseRow.addComponents(buildMuteButton(creatorUserId, creatorDisplayName))
    } else {
      rows.push(buildMuteRow(creatorUserId, creatorDisplayName))
    }
  }

  if (!(options.forceInteractive ?? supportsDiscordInteractiveMessages())) {
    return [buildLinkRow(options.playIntentId)]
  }

  return appendOpenInAppButton(
    rows,
    buildPlayAppUrl(options.playIntentId),
    'Open in App'
  )
}

export function buildScheduledPlayIntentCheckInComponents(
  notificationId: string,
  options: {
    forceInteractive?: boolean;
    playIntentId?: string;
  } = {}
) {
  return (options.forceInteractive ?? supportsDiscordInteractiveMessages())
    ? appendOpenInAppButton(
        [buildScheduledCheckInResponseRow(notificationId)],
        buildPlayAppUrl(options.playIntentId),
        'Open in App'
      )
    : [buildLinkRow(options.playIntentId)]
}

export function buildPlayIntentNotificationPromptPreview(options: {
  notificationId: string;
  playIntentId?: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  responseChoice?: NotificationResponseChoice | null;
  creatorUserId?: string | null;
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null;
  interestedCount?: number;
  interestedUserLabels?: string[];
  responseCustomIdBuilder?: (response: 'interested' | 'pass') => string;
  intentDetails?: RecipientPlayIntentDetails;
  summaryStatus?: AudiencePlayIntentSummaryStatus;
}): DirectMessagePreviewPayload {
  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED) {
    return {
      content: buildGoTimeConfirmedReplyMessage({
        creatorDiscordUserId: options.creatorDiscordUserId,
        creatorDisplayName: options.creatorDisplayName,
        voiceChannel: options.voiceChannel,
        discordSpace: options.discordSpace
      }),
      components: []
    }
  }

  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER) {
    return {
      content: buildGoTimeReminderReplyMessage({
        creatorDiscordUserId: options.creatorDiscordUserId,
        creatorDisplayName: options.creatorDisplayName
      }),
      components: []
    }
  }

  return {
    content: buildPlayIntentDirectMessageHeading(options.title),
    embeds: buildPlayIntentDirectMessageEmbeds(
      options.title,
      options.body,
      options.creatorDiscordUserId,
      options.creatorDisplayName,
      options.voiceChannel,
      options.interestedCount,
      options.interestedUserLabels,
      options.discordSpace,
      {
        intentDetails: options.intentDetails,
        includeUpdateDescription: true,
        summaryStatus: options.summaryStatus,
        showVoiceChannel: true
      }
    ),
    components: buildPlayIntentNotificationComponents(
      options.notificationId,
      options.creatorUserId ?? undefined,
      options.creatorDisplayName ?? undefined,
      options.responseChoice,
      options.notificationType,
      {
        forceInteractive: true,
        playIntentId: options.playIntentId,
        responseCustomIdBuilder: options.responseCustomIdBuilder
      }
    )
  }
}

export function buildScheduledCheckInPromptPreview(options: {
  notificationId: string;
  playIntentId?: string;
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
  resolved?: boolean;
}): DirectMessagePreviewPayload {
  const creatorMention = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'there'

  return {
    content: buildDiscordMessageHeading('⏰ Go-Time Check-In'),
    embeds: buildScheduledCheckInEmbeds(creatorMention),
    components: options.resolved
      ? [buildLinkRow(options.playIntentId)]
      : buildScheduledPlayIntentCheckInComponents(options.notificationId, {
          forceInteractive: true,
          playIntentId: options.playIntentId
        })
  }
}

export function buildNotificationDirectMessagePreview(options: {
  notificationId: string;
  playIntentId?: string;
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
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null;
  interestedCount?: number;
  interestedUserLabels?: string[];
  actorDisplayName?: string | null;
  actorDiscordUserId?: string | null;
  passAcknowledgementMode?: PassAcknowledgementMode;
  intentDetails?: RecipientPlayIntentDetails;
  summaryStatus?: AudiencePlayIntentSummaryStatus;
  renderSurface?: 'notification' | 'response';
}): DirectMessagePreviewPayload {
  const creatorLabel = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'this player'
  const systemNotificationDefinition = options.notificationType === NotificationType.SYSTEM
    ? getPlayIntentSystemNotificationDefinitionByTitle(options.title)
    : null
  const renderState = resolveNotificationDirectMessageRenderState({
    notificationType: options.notificationType,
    responseChoice: options.responseChoice,
    playIntentIsActive: options.playIntentIsActive,
    renderSurface: options.renderSurface
  })

  const previewBody = options.actorDisplayName
    ? replaceDisplayNameWithMention(options.body, options.actorDisplayName, options.actorDiscordUserId)
    : options.body

  if (renderState.kind === 'scheduled-check-in') {
    if (renderState.variant === 'canceled') {
      return {
        content: buildCreatorEndedMessage(),
        components: [buildLinkRow(options.playIntentId)]
      }
    }

    if (renderState.variant === 'confirmed') {
      return {
        content: buildCreatorConfirmedMessage(),
        components: []
      }
    }

    if (renderState.variant === 'expired') {
      return {
        content: buildExpiredMessage('This call to play expired before you confirmed.'),
        components: []
      }
    }

    return buildScheduledCheckInPromptPreview({
      notificationId: options.notificationId,
      playIntentId: options.playIntentId,
      creatorDiscordUserId: options.creatorDiscordUserId,
      creatorDisplayName: options.creatorDisplayName
    })
  }

  if (renderState.kind === 'audience-play-intent') {
    if (renderState.variant === 'joined') {
      return {
        content: buildInterestedAcceptedMessage(creatorLabel, options.discordSpace),
        components: []
      }
    }

    if (renderState.variant === 'declined') {
      return {
        content: buildPassAcceptedMessage(options.passAcknowledgementMode),
        components: []
      }
    }

    if (renderState.variant === 'expired') {
      return {
        content: buildExpiredMessage(buildSessionEndedReason(creatorLabel, options.gameTitle ?? null)),
        components: [buildLinkRow(options.playIntentId)]
      }
    }

    const promptPreview = buildPlayIntentNotificationPromptPreview({
      notificationId: options.notificationId,
      playIntentId: options.playIntentId,
      notificationType: options.notificationType,
      title: options.title,
      body: options.body,
      responseChoice: options.responseChoice,
      creatorUserId: options.creatorUserId,
      creatorDiscordUserId: options.creatorDiscordUserId,
      creatorDisplayName: options.creatorDisplayName,
      voiceChannel: options.voiceChannel,
      discordSpace: options.discordSpace,
      interestedCount: options.interestedCount,
      interestedUserLabels: options.interestedUserLabels,
      intentDetails: options.intentDetails,
      summaryStatus: options.summaryStatus
    })

    return options.renderSurface === 'response'
      ? {
          ...promptPreview,
          components: []
        }
      : promptPreview
  }

  if (systemNotificationDefinition?.key === callToPlayEndedSystemNotification.key) {
    return {
      content: buildDiscordMessageHeading('🛑 Call to Play Ended'),
      embeds: buildArchivedPlayIntentEmbeds(previewBody),
      components: buildArchivedAudienceCleanupComponents(options.notificationId, {
        playIntentId: options.playIntentId
      })
    }
  }

  return {
    content: buildDiscordPlainMessage(
      buildDiscordMessageHeading(options.title),
      previewBody.split('\n')
    ),
    components: systemNotificationDefinition?.componentMode === 'none'
      ? []
      : [buildLinkRow(options.playIntentId)]
  }
}

function buildCreatorPlayIntentSummaryComponents(
  playIntentId: string,
  isActive: boolean,
  isScheduled: boolean,
  hasDeletableDiscordSpace: boolean,
  options: {
    forceInteractive?: boolean;
  } = {}
) {
  if (!(options.forceInteractive ?? supportsDiscordInteractiveMessages())) {
    return [buildLinkRow(playIntentId)]
  }

  return appendOpenInAppButton(
    [
      isActive
        ? (isScheduled
            ? buildCreatorSummaryScheduledActionRow(playIntentId)
            : buildCreatorSummaryActionRow(playIntentId))
        : (() => {
            const row = buildCreatorSummaryCleanupRow(playIntentId)

            if (hasDeletableDiscordSpace) {
              row.addComponents(buildCreatorSummaryDeleteSpaceButton(playIntentId))
            }

            return row
          })()
    ],
    buildPlayAppUrl(playIntentId),
    'Open in App'
  )
}

function formatDiscordSpaceStatusLabel(status: NonNullable<CreatorPlayIntentSummarySnapshot['discordSpace']>['status']) {
  switch (status) {
    case 'REQUESTED':
      return 'Requested'
    case 'PROVISIONING':
      return 'Provisioning'
    case 'ACTIVE':
      return 'Active'
    case 'RETAINED':
      return 'Retained for cleanup'
    case 'DELETE_REQUESTED':
      return 'Delete requested'
    case 'DELETED':
      return 'Deleted'
    case 'PROVISION_FAILED':
      return 'Provision failed'
  }
}

function buildCreatorDiscordSpaceSummary(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (!snapshot.discordSpace) {
    return null
  }

  return [
    `Status: ${formatDiscordSpaceStatusLabel(snapshot.discordSpace.status)}`,
    snapshot.discordSpace.textChannelUrl
      ? `Text channel: ${snapshot.discordSpace.textChannelUrl}`
      : snapshot.discordSpace.textChannelName
        ? `Text channel: ${snapshot.discordSpace.textChannelName}`
      : null,
    snapshot.discordSpace.voiceChannelUrl
      ? `Voice channel: ${snapshot.discordSpace.voiceChannelUrl}`
      : snapshot.discordSpace.voiceChannelName
        ? `Voice channel: ${snapshot.discordSpace.voiceChannelName}`
      : null,
    snapshot.discordSpace.inviteUrl
      ? `Invite link (shareable): ${snapshot.discordSpace.inviteUrl}`
      : null,
    snapshot.discordSpace.deleteAfter
      ? `Delete after: ${formatPlayIntentDateLabel(snapshot.discordSpace.deleteAfter, snapshot.user.timezoneId)}`
      : null
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function hasCreatorDeletableDiscordSpace(snapshot: CreatorPlayIntentSummarySnapshot) {
  return snapshot.discordSpace != null
    && snapshot.discordSpace.status !== 'DELETED'
    && snapshot.discordSpace.status !== 'REQUESTED'
    && snapshot.discordSpace.status !== 'PROVISIONING'
}

function formatSummaryWindow(startsAt: Date, endsAt: Date, timezoneId: string) {
  const startsAtLabel = formatPlayIntentDateLabel(startsAt, timezoneId)
  const windowLabel = formatPlayIntentWindowLabel(startsAt, endsAt, timezoneId)

  return {
    startsAtLabel,
    windowLabel
  }
}

function buildCreatorPlayIntentSummaryHeading(startsAtLabel: string) {
  return buildDiscordMessageHeading(`🎮 Your Call to Play for ${startsAtLabel}`)
}

function summarizeCreatorAudience(snapshot: CreatorPlayIntentSummarySnapshot) {
  return `Audience: ${summarizePlayIntentAudience(snapshot.scope, snapshot.targetDiscordServers, snapshot.targetFriends) ?? 'Friends only'}`
}

function summarizeCreatorGames(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (snapshot.selectionMode === 'ENTIRE_LIBRARY') {
    return 'Games: Your library'
  }

  return `Games: ${summarizePlayIntentGames(snapshot.selectionMode, snapshot.games.map((entry) => entry.game.title)) ?? 'None selected.'}`
}

function formatInterestedUserLabelSummary(labels: string[]) {
  const sortedLabels = [...labels].sort((left, right) => left.localeCompare(right))

  if (sortedLabels.length <= 5) {
    return sortedLabels.join(', ')
  }

  return `${sortedLabels.slice(0, 5).join(', ')} +${sortedLabels.length - 5} more`
}

function getCreatorSummaryRecipientStats(snapshot: CreatorPlayIntentSummarySnapshot) {
  const relevantNotifications = snapshot.notifications.filter((notification) =>
    notification.type === NotificationType.FRIEND_PLAYING
    || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
    || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
  )

  const latestByUserId = new Map<string, {
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    interestedUserLabel: string;
  }>()
  const deliveredUserIds = new Set<string>()

  for (const notification of relevantNotifications) {
    if (notification.deliveredAt) {
      deliveredUserIds.add(notification.userId)
    }

    if (!latestByUserId.has(notification.userId)) {
      latestByUserId.set(notification.userId, {
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        interestedUserLabel: notification.user
          ? buildDiscordUserLabel(notification.user.displayName, notification.user.identities?.[0]?.providerUserId)
          : notification.userId
      })
    }
  }

  let interestedCount = 0
  let passedCount = 0
  let waitingCount = 0
  const interestedUserLabels: string[] = []

  for (const status of latestByUserId.values()) {
    if (status.responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1
      interestedUserLabels.push(status.interestedUserLabel)
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
    interestedUserLabels,
    passedCount,
    waitingCount
  }
}

function getCreatorSummaryStatus(snapshot: CreatorPlayIntentSummarySnapshot, currentTime = new Date()) {
  const latestCheckIn = snapshot.notifications.find((notification) => notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN)

  if (snapshot.expiresAt <= currentTime) {
    return 'Status: Ended'
  }

  if (latestCheckIn?.responseChoice === NotificationResponseChoice.CANCELED) {
    return 'Status: Ended'
  }

  if (latestCheckIn && !latestCheckIn.respondedAt && snapshot.windowStartsAt <= currentTime) {
    return 'Status: Starting now - waiting for your confirmation'
  }

  if (snapshot.windowStartsAt.getTime() > currentTime.getTime() + 60 * 1000) {
    return 'Status: Scheduled'
  }

  return 'Status: Live now'
}

function buildCreatorPlayIntentSummaryEmbeds(
  snapshot: CreatorPlayIntentSummarySnapshot,
  currentTime = new Date()
) {
  const stats = getCreatorSummaryRecipientStats(snapshot)
  const { windowLabel } = formatSummaryWindow(
    snapshot.windowStartsAt,
    snapshot.windowEndsAt,
    snapshot.user.timezoneId
  )
  const statusLabel = getCreatorSummaryStatus(snapshot, currentTime).replace(/^Status:\s*/, '')
  const statusColor = statusLabel === 'Ended'
    ? dmEmbedColors.danger
    : statusLabel === 'Scheduled'
      ? dmEmbedColors.info
      : statusLabel === 'Live now'
        ? dmEmbedColors.success
        : dmEmbedColors.warning

  return [
    new EmbedBuilder()
      .setColor(statusColor)
      .setDescription(snapshot.headline)
      .addFields(buildDiscordEmbedFields([
        {
          name: formatPlayIntentEmbedFieldName('Status'),
          value: statusLabel,
          inline: true
        },
        {
          name: formatPlayIntentEmbedFieldName('Games'),
          value: summarizeCreatorGames(snapshot).replace(/^Games:\s*/, ''),
          inline: false
        },
        {
          name: formatPlayIntentEmbedFieldName('Audience'),
          value: summarizeCreatorAudience(snapshot).replace(/^Audience:\s*/, ''),
          inline: false
        },
        {
          name: formatPlayIntentEmbedFieldName('Window'),
          value: windowLabel,
          inline: true
        },
        {
          name: formatPlayIntentEmbedFieldName('Responses'),
          value: `Interested: ${stats.interestedCount}\nPassed: ${stats.passedCount}\nWaiting: ${stats.waitingCount}`,
          inline: true
        },
        {
          name: formatPlayIntentEmbedFieldName('Interested Players'),
          value: stats.interestedUserLabels.length > 0
            ? formatInterestedUserLabelSummary(stats.interestedUserLabels)
            : 'No one yet.',
          inline: false
        },
        {
          name: formatPlayIntentEmbedFieldName('Note'),
          value: snapshot.note,
          inline: false
        },
        {
          name: formatPlayIntentEmbedFieldName('Voice Channel'),
          value: buildCreatorDiscordSpaceSummary(snapshot),
          inline: false
        }
      ]))
      .setFooter({
        text: snapshot.expiresAt > currentTime
          ? 'Use the buttons below to open the app or end this call to play.'
          : 'Open the app below if you want to post another call to play.'
      })
  ]
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
    identities?: { providerUserId: string }[];
  };
  targetDiscordServers: {
    server: {
      name: string;
    };
  }[];
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
    user?: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  discordSpace?: CreatorPlayIntentSummarySnapshot['discordSpace'];
  currentTime?: Date;
}): DirectMessagePreviewPayload {
  const currentTime = snapshot.currentTime ?? new Date()
  const startsAtLabel = formatPlayIntentDateLabel(snapshot.windowStartsAt, snapshot.user.timezoneId)
  const typedSnapshot = {
    ...snapshot,
    discordSpace: snapshot.discordSpace ?? null
  } as CreatorPlayIntentSummarySnapshot

  return {
    content: buildCreatorPlayIntentSummaryHeading(startsAtLabel),
    embeds: buildCreatorPlayIntentSummaryEmbeds(typedSnapshot, currentTime),
    components: buildCreatorPlayIntentSummaryComponents(
      snapshot.id,
      snapshot.expiresAt > currentTime,
      isScheduledPlayIntentWindow(snapshot.windowStartsAt, currentTime),
      hasCreatorDeletableDiscordSpace(typedSnapshot),
      {
        forceInteractive: true
      }
    )
  }
}

async function getCreatorPlayIntentSummarySnapshot(playIntentId: string) {
  const snapshot = await prisma.playIntent.findUnique({
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
      discordSpace: {
        select: {
          serverId: true,
          status: true,
          textChannelId: true,
          textChannelName: true,
          voiceChannelId: true,
          voiceChannelName: true,
          inviteUrl: true,
          deleteAfter: true
        }
      },
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
      targetDiscordServers: {
        select: {
          server: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
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
          createdAt: true,
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

  if (!snapshot) {
    return null
  }

  return {
    ...snapshot,
    discordSpace: snapshot.discordSpace
      ? {
          status: snapshot.discordSpace.status,
          textChannelName: snapshot.discordSpace.textChannelName,
          textChannelUrl: buildDiscordChannelUrl(snapshot.discordSpace.serverId, snapshot.discordSpace.textChannelId),
          voiceChannelName: snapshot.discordSpace.voiceChannelName,
          voiceChannelUrl: buildDiscordChannelUrl(snapshot.discordSpace.serverId, snapshot.discordSpace.voiceChannelId),
          inviteUrl: snapshot.discordSpace.inviteUrl,
          deleteAfter: snapshot.discordSpace.deleteAfter
        }
      : null
  }
}

type CreatorPlayIntentSummarySyncOptions = {
  notifyOnActiveChange?: boolean;
}

export function shouldKeepCreatorDiscordInviteReply(options: {
  isActive: boolean;
  inviteUrl?: string | null;
}) {
  return options.isActive && Boolean(options.inviteUrl)
}

async function deleteUntrackedCreatorSummaryReplies(options: {
  playIntentId: string;
  summaryMessage: { channelId: string; messageId: string };
}) {
  const preservedTargets = (await prisma.notification.findMany({
    where: {
      playIntentId: options.playIntentId,
      discordDmChannelId: options.summaryMessage.channelId,
      discordDmMessageId: {
        not: null
      }
    },
    select: {
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })).flatMap((notification) => (
    notification.discordDmChannelId && notification.discordDmMessageId
      ? [{
          channelId: notification.discordDmChannelId,
          messageId: notification.discordDmMessageId
        }]
      : []
  ))

  await deleteReplyMessagesReferencingTargets({
    targets: [options.summaryMessage],
    preservedTargets
  })
}

async function sendOrEditCreatorPlayIntentSummary(
  playIntentId: string,
  _options: CreatorPlayIntentSummarySyncOptions = {}
) {
  void _options

  const snapshot = await getCreatorPlayIntentSummarySnapshot(playIntentId)

  if (!snapshot) {
    return
  }

  const creatorDiscordUserId = snapshot.user.identities[0]?.providerUserId

  if (!creatorDiscordUserId) {
    return
  }

  const isActive = snapshot.expiresAt > new Date()
  const isScheduled = isScheduledPlayIntentWindow(snapshot.windowStartsAt, new Date())
  const startsAtLabel = formatPlayIntentDateLabel(snapshot.windowStartsAt, snapshot.user.timezoneId)
  const content = buildCreatorPlayIntentSummaryHeading(startsAtLabel)
  const embeds = buildCreatorPlayIntentSummaryEmbeds(snapshot)
  const components = buildCreatorPlayIntentSummaryComponents(
    playIntentId,
    isActive,
    isScheduled,
    hasCreatorDeletableDiscordSpace(snapshot)
  )

  const trackedResult = await syncTrackedDiscordDirectMessage({
    tracked: {
      channelId: snapshot.creatorDiscordDmChannelId,
      messageId: snapshot.creatorDiscordDmMessageId
    },
    discordUserId: creatorDiscordUserId,
    content,
    embeds,
    components,
    onMissingTrackedMessage: async () => {
      await prisma.playIntent.update({
        where: {
          id: playIntentId
        },
        data: {
          creatorDiscordDmChannelId: null,
          creatorDiscordDmMessageId: null
        }
      })
    },
    onSent: async (result) => {
      await prisma.playIntent.update({
        where: {
          id: playIntentId
        },
        data: {
          creatorDiscordDmChannelId: result.channelId,
          creatorDiscordDmMessageId: result.messageId
        }
      })
    }
  })

  const summaryMessage = trackedResult.channelId && trackedResult.messageId
    ? {
        channelId: trackedResult.channelId,
        messageId: trackedResult.messageId
      }
    : snapshot.creatorDiscordDmChannelId && snapshot.creatorDiscordDmMessageId
      ? {
          channelId: snapshot.creatorDiscordDmChannelId,
          messageId: snapshot.creatorDiscordDmMessageId
        }
      : null

  const keepInviteReply = shouldKeepCreatorDiscordInviteReply({
    isActive,
    inviteUrl: snapshot.discordSpace?.inviteUrl
  })

  if (summaryMessage && !keepInviteReply) {
    await deleteUntrackedCreatorSummaryReplies({
      playIntentId,
      summaryMessage
    })
  }

  if (keepInviteReply && trackedResult.status === 'sent' && trackedResult.channelId && trackedResult.messageId) {
    const inviteReply = buildDiscordInviteReplyPayload({
      discordUserId: creatorDiscordUserId,
      inviteUrl: snapshot.discordSpace?.inviteUrl,
      replyTo: buildTrackedDirectMessageReplyReference(trackedResult.channelId, trackedResult.messageId)
    })

    if (inviteReply) {
      await sendDiscordDirectMessages([inviteReply])
    }
  }
}

export async function syncCreatorPlayIntentSummaryMessages(
  playIntentIds: string[],
  options: CreatorPlayIntentSummarySyncOptions = {}
) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  for (const playIntentId of uniquePlayIntentIds) {
    await sendOrEditCreatorPlayIntentSummary(playIntentId, options)
  }
}

export async function refreshTrackedCreatorPlayIntentSummaryMessages() {
  const trackedPlayIntentIds = (await prisma.playIntent.findMany({
    where: {
      creatorDiscordDmChannelId: {
        not: null
      },
      creatorDiscordDmMessageId: {
        not: null
      }
    },
    select: {
      id: true
    }
  })).map((playIntent) => playIntent.id)

  for (const playIntentId of trackedPlayIntentIds) {
    const snapshot = await getCreatorPlayIntentSummarySnapshot(playIntentId)

    if (!snapshot?.creatorDiscordDmChannelId || !snapshot.creatorDiscordDmMessageId) {
      continue
    }

    const currentTime = new Date()
    const startsAtLabel = formatPlayIntentDateLabel(snapshot.windowStartsAt, snapshot.user.timezoneId)
    const result = await editDiscordDirectMessage({
      channelId: snapshot.creatorDiscordDmChannelId,
      messageId: snapshot.creatorDiscordDmMessageId,
      content: buildCreatorPlayIntentSummaryHeading(startsAtLabel),
      embeds: buildCreatorPlayIntentSummaryEmbeds(snapshot, currentTime),
      components: buildCreatorPlayIntentSummaryComponents(
        snapshot.id,
        snapshot.expiresAt > currentTime,
        isScheduledPlayIntentWindow(snapshot.windowStartsAt, currentTime),
        hasCreatorDeletableDiscordSpace(snapshot)
      )
    })

    if (result.status === 'failed' && isMissingDiscordMessageError(result.error)) {
      await prisma.playIntent.update({
        where: {
          id: playIntentId
        },
        data: {
          creatorDiscordDmChannelId: null,
          creatorDiscordDmMessageId: null
        }
      })
    }
  }
}

export async function refreshTrackedPlayIntentNotificationDirectMessages(options: {
  playIntentIds?: string[];
} = {}) {
  const targetPlayIntentIds = options.playIntentIds?.filter((playIntentId): playIntentId is string => Boolean(playIntentId)) ?? []
  const notifications = await prisma.notification.findMany({
    where: {
      discordDmChannelId: {
        not: null
      },
      discordDmMessageId: {
        not: null
      },
      ...(targetPlayIntentIds.length > 0
        ? {
            playIntentId: {
              in: targetPlayIntentIds
            }
          }
        : {})
    },
    select: {
      id: true,
      userId: true,
      triggeredByUserId: true,
      playIntentId: true,
      type: true,
      title: true,
      body: true,
      responseChoice: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
      recipientResponseDiscordDmChannelId: true,
      recipientResponseDiscordDmMessageId: true,
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          id: true,
          userId: true,
          scope: true,
          headline: true,
          selectionMode: true,
          note: true,
          windowStartsAt: true,
          expiresAt: true,
          voiceChannelId: true,
          voiceChannelName: true,
          targetDiscordServers: {
            select: {
              server: {
                select: {
                  name: true
                }
              }
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
                  title: true,
                  coverUrl: true
                }
              }
            }
          },
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
      createdAt: 'asc'
    }
  })

  const now = new Date()
  const playIntentIds = [...new Set(notifications.map((notification) => notification.playIntentId).filter((playIntentId): playIntentId is string => Boolean(playIntentId)))]
  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId(playIntentIds)
  const complementarySpaceRecipientContextByPlayIntentId = new Map<string, Map<string, PlayIntentDiscordSpaceRecipientContext>>()
  const recipientUserIds = [...new Set(notifications.map((notification) => notification.userId))]

  for (const playIntentId of playIntentIds) {
    complementarySpaceRecipientContextByPlayIntentId.set(
      playIntentId,
      await getPlayIntentDiscordSpaceRecipientContexts(playIntentId, recipientUserIds)
    )
  }
  const triggeredByUserIds = [...new Set(notifications.map((notification) => notification.triggeredByUserId).filter((userId): userId is string => Boolean(userId)))]
  const actors = triggeredByUserIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: triggeredByUserIds
          }
        },
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
      })
    : []
  const actorByUserId = new Map(actors.map((actor) => [actor.id, actor]))

  const voiceChannelNotifications = notifications.filter((notification) =>
    notification.playIntent?.voiceChannelId && notification.playIntent.userId !== notification.userId
  )
  const creatorIdsWithVoiceChannels = [...new Set(voiceChannelNotifications.map((notification) => notification.playIntent?.userId).filter((userId): userId is string => Boolean(userId)))]
  const creatorMemberships = creatorIdsWithVoiceChannels.length > 0
    ? await prisma.discordServerMembership.findMany({
        where: {
          userId: {
            in: creatorIdsWithVoiceChannels
          }
        },
        select: {
          userId: true,
          serverId: true
        }
      })
    : []
  const creatorServerIdsByUserId = new Map<string, Set<string>>()

  for (const membership of creatorMemberships) {
    const serverIds = creatorServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    serverIds.add(membership.serverId)
    creatorServerIdsByUserId.set(membership.userId, serverIds)
  }

  const relevantRecipientUserIds = [...new Set(voiceChannelNotifications.map((notification) => notification.userId))]
  const relevantServerIds = [...new Set(creatorMemberships.map((membership) => membership.serverId))]
  const recipientMemberships = relevantRecipientUserIds.length > 0 && relevantServerIds.length > 0
    ? await prisma.discordServerMembership.findMany({
        where: {
          userId: {
            in: relevantRecipientUserIds
          },
          serverId: {
            in: relevantServerIds
          }
        },
        select: {
          userId: true,
          serverId: true
        }
      })
    : []
  const recipientServerIdsByUserId = new Map<string, Set<string>>()

  for (const membership of recipientMemberships) {
    const serverIds = recipientServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    serverIds.add(membership.serverId)
    recipientServerIdsByUserId.set(membership.userId, serverIds)
  }

  const latestExplicitAudienceResponseByRecipientKey = new Map<string, NotificationResponseChoice>()

  for (const notification of notifications) {
    if (
      !notification.playIntentId
      || (
        notification.type !== NotificationType.FRIEND_PLAYING
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      )
      || !notification.responseChoice
      || notification.responseChoice === NotificationResponseChoice.EXPIRED
    ) {
      continue
    }

    latestExplicitAudienceResponseByRecipientKey.set(
      `${notification.playIntentId}:${notification.userId}`,
      notification.responseChoice
    )
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    const playIntent = notification.playIntent
    const interestedUsers = notification.playIntentId
      ? interestedUsersByPlayIntentId.get(notification.playIntentId) ?? []
      : []
    const creatorDiscordUserId = playIntent?.user.identities[0]?.providerUserId ?? null
    const actor = notification.triggeredByUserId ? actorByUserId.get(notification.triggeredByUserId) ?? null : null
    const creatorServerIds = playIntent?.userId ? creatorServerIdsByUserId.get(playIntent.userId) ?? new Set<string>() : new Set<string>()
    const recipientServerIds = recipientServerIdsByUserId.get(notification.userId) ?? new Set<string>()
    const recipientSharesServer = creatorServerIds.size > 0
      ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
      : false
    const voiceChannel = playIntent?.voiceChannelId || playIntent?.voiceChannelName
      ? {
          channelId: playIntent?.voiceChannelId ?? null,
          channelName: playIntent?.voiceChannelName ?? null,
          recipientSharesServer
        }
      : null
    const discordSpace = notification.playIntentId
      ? complementarySpaceRecipientContextByPlayIntentId.get(notification.playIntentId)?.get(notification.userId) ?? null
      : null
    const passAcknowledgementMode = getPassAcknowledgementMode(playIntent?.scope)
    const interestedUserLabels = interestedUsers.map((user) => buildDiscordUserLabel(
      user.displayName,
      user.identities?.[0]?.providerUserId
    ))
    const effectiveAudienceResponseChoice = notification.playIntentId
      ? latestExplicitAudienceResponseByRecipientKey.get(`${notification.playIntentId}:${notification.userId}`) ?? null
      : null
    const previewResponseChoice = (
      notification.type === NotificationType.FRIEND_PLAYING
      || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
      || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
    )
      ? effectiveAudienceResponseChoice
      : notification.responseChoice
    const previewOptions = {
      notificationId: notification.id,
      playIntentId: notification.playIntentId ?? undefined,
      notificationType: notification.type,
      title: notification.title,
      body: notification.body,
      responseChoice: previewResponseChoice,
      creatorUserId: playIntent?.user.id ?? null,
      creatorDiscordUserId,
      creatorDisplayName: playIntent?.user.displayName ?? null,
      gameTitle: notification.game?.title ?? null,
      playIntentIsActive: playIntent ? playIntent.expiresAt > now : false,
      voiceChannel,
      discordSpace,
      interestedCount: interestedUserLabels.length > 0 ? interestedUserLabels.length : undefined,
      interestedUserLabels,
      passAcknowledgementMode,
      summaryStatus: playIntent
        ? resolveAudiencePlayIntentSummaryStatus(playIntent.windowStartsAt, now)
        : undefined,
      intentDetails: playIntent
        ? {
            selectionMode: playIntent.selectionMode,
            headline: playIntent.headline,
            selectedGameTitles: playIntent.games.map((entry) => entry.game.title),
            scope: playIntent.scope,
            targetDiscordServers: playIntent.targetDiscordServers,
            targetFriends: playIntent.targetFriends,
            note: playIntent.note
          }
        : undefined,
      actorDisplayName: actor?.displayName ?? null,
      actorDiscordUserId: actor?.identities[0]?.providerUserId ?? null
    }

    const preview = buildNotificationDirectMessagePreview(previewOptions)

    const embeds = notification.type === NotificationType.FRIEND_PLAYING && playIntent
      ? [
          ...(preview.embeds ?? []),
          ...buildPlayIntentGameEmbeds(playIntent)
        ]
      : preview.embeds

    const result = await editDiscordDirectMessage({
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      content: preview.content,
      embeds,
      components: preview.components
    })

    if (result.status === 'failed' && isMissingDiscordMessageError(result.error)) {
      await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          discordDmChannelId: null,
          discordDmMessageId: null
        }
      })
    }

    if (
      previewResponseChoice
      && previewResponseChoice !== NotificationResponseChoice.EXPIRED
      && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      && notification.recipientResponseDiscordDmChannelId
      && notification.recipientResponseDiscordDmMessageId
    ) {
      const followUpPreview = buildNotificationDirectMessagePreview({
        ...previewOptions,
        renderSurface: 'response'
      })

      const followUpResult = await editDiscordDirectMessage({
        channelId: notification.recipientResponseDiscordDmChannelId,
        messageId: notification.recipientResponseDiscordDmMessageId,
        content: followUpPreview.content,
        embeds: followUpPreview.embeds,
        components: followUpPreview.components
      })

      if (followUpResult.status === 'failed' && isMissingDiscordMessageError(followUpResult.error)) {
        await prisma.notification.update({
          where: {
            id: notification.id
          },
          data: {
            recipientResponseDiscordDmChannelId: null,
            recipientResponseDiscordDmMessageId: null
          }
        })
      }
    }
  }
}

function buildExpiredMessage(reason: string) {
  return buildDiscordPlainMessage(
    '⌛ Call to Play Ended',
    [
      'This call-to-play prompt is no longer available.',
      reason
    ],
    {
      trailingSubtext: 'Open the app if you still want to coordinate or post your own call to play.'
    }
  )
}

function buildInterestedAcceptedMessage(
  creatorLabel: string,
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null
) {
  const textChannelValue = discordSpace
    ? buildRecipientDiscordSpaceChannelReference({
        channelUrl: discordSpace.textChannelUrl,
        channelName: discordSpace.textChannelName,
        recipientInServer: discordSpace.recipientInServer
      })
    : null
  const complementaryLines = discordSpace
    ? [
        textChannelValue ? `Text channel: ${textChannelValue}` : null,
        !discordSpace.recipientInServer && discordSpace.inviteUrl
          ? `Invite link (shareable): ${discordSpace.inviteUrl}`
          : null,
        !discordSpace.recipientInServer && discordSpace.inviteUrl
          ? 'The Discord channel will appear after you join.'
          : null
      ]
    : []

  return buildDiscordPlainMessage(
    '✅ You\'re In',
    [
      `You are marked as interested. ${creatorLabel} has been notified.`,
      ...complementaryLines
    ],
    {
      trailingSubtext: 'If you change your mind you can switch to "Pass" later.'
    }
  )
}

const passAcknowledgementCopyByMode = {
  anonymous: {
    bodyLine: 'Passing is anonymous.',
    subtext: 'Passing is anonymous.'
  },
  'creator-notified': {
    bodyLine: 'The creator has been notified.',
    subtext: 'The creator can see passes for this targeted call to play.'
  }
} as const satisfies Record<PassAcknowledgementMode, { bodyLine: string; subtext: string }>

function getPassAcknowledgementMode(scope: PlayIntentScope | null | undefined): PassAcknowledgementMode {
  return scope === PlayIntentScope.SPECIFIC_FRIENDS ? 'creator-notified' : 'anonymous'
}

function getPassAcknowledgementCopy(mode: PassAcknowledgementMode = 'anonymous') {
  return passAcknowledgementCopyByMode[mode]
}

function buildPassAcceptedMessage(mode: PassAcknowledgementMode = 'anonymous') {
  const acknowledgementCopy = getPassAcknowledgementCopy(mode)

  return buildDiscordPlainMessage(
    '❎ Passed for Now',
    [
      'You are marked as passing for now.',
      acknowledgementCopy.bodyLine
    ],
    {
      trailingSubtext: 'If you change your mind you can switch to "I\'m interested" later.'
    }
  )
}

function buildSessionEndedReason(creatorLabel: string, gameTitle: string | null) {
  return gameTitle
    ? `${creatorLabel}'s ${gameTitle} session ended before you answered.`
    : `${creatorLabel}'s call to play ended before you answered.`
}

function buildCreatorConfirmedMessage() {
  return buildDiscordPlainMessage(
    '✅ Call Confirmed',
    [
      'I let everyone know your call to play is still on.',
      'I reminded anyone who had not answered yet.'
    ]
  )
}

function buildCreatorEndedMessage() {
  return buildDiscordPlainMessage(
    '🛑 Call Ended',
    [
      'I ended this call to play.',
      'I let your audience know it ended.'
    ],
    {
      trailingSubtext: 'You can post a fresh call to play whenever you are ready.'
    }
  )
}

function buildCreatorCheckInAlreadyHandledMessage(responseChoice: NotificationResponseChoice | null) {
  return buildDiscordPlainMessage(
    'ℹ️ Already Handled',
    [responseChoice === NotificationResponseChoice.CONFIRMED
      ? 'You already confirmed that this call to play is still on.'
      : responseChoice === NotificationResponseChoice.CANCELED
        ? 'You already ended this call to play.'
        : 'This check-in was already handled earlier.']
  )
}

function buildGoTimeCopy(creatorDisplayName: string, message: string) {
  return {
    title: `${creatorDisplayName} confirmed the session is on`,
    body: `Update: ${creatorDisplayName} ${message}\nWhen: Right now.`
  }
}

function buildGoTimeConfirmedCopy(creatorDisplayName: string) {
  return buildGoTimeCopy(creatorDisplayName, 'confirmed the session is still on.')
}

export function buildGoTimeReminderCopy(creatorDisplayName: string) {
  return buildGoTimeCopy(creatorDisplayName, 'confirmed this session is still on.')
}

function buildPassResultMessage(message: string, mode: PassAcknowledgementMode = 'anonymous') {
  const acknowledgementCopy = getPassAcknowledgementCopy(mode)

  return buildDiscordPlainMessage(
    '👍 Passed for Now',
    [
      message
    ],
    {
      trailingSubtext: acknowledgementCopy.subtext
    }
  )
}

function buildTrackedDirectMessageReplyReference(
  channelId: string | null | undefined,
  messageId: string | null | undefined
): DiscordDirectMessagePayload['replyTo'] {
  if (!channelId || !messageId) {
    return undefined
  }

  return {
    channelId,
    messageId
  }
}

async function getCreatorPlayIntentSummaryReplyReference(playIntentId: string) {
  const playIntent = await prisma.playIntent.findUnique({
    where: {
      id: playIntentId
    },
    select: {
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true
    }
  })

  return buildTrackedDirectMessageReplyReference(
    playIntent?.creatorDiscordDmChannelId,
    playIntent?.creatorDiscordDmMessageId
  )
}

async function sendCreatorPlayIntentSummaryReply(options: {
  playIntentId: string;
  discordUserId: string;
  content: string;
  components?: MessageCreateOptions['components'];
  embeds?: MessageCreateOptions['embeds'];
}) {
  const replyTo = await getCreatorPlayIntentSummaryReplyReference(options.playIntentId)

  return (await sendDiscordDirectMessages([
    {
      discordUserId: options.discordUserId,
      content: options.content,
      embeds: options.embeds,
      components: options.components,
      replyTo
    }
  ]))[0]
}

async function upsertCreatorResponseSystemNotification(
  transaction: Prisma.TransactionClient,
  options: {
    playIntentId: string;
    creatorUserId: string;
    recipientUserId: string;
    gameId: string | null;
    title: string;
    body: string;
  }
) {
  const existingNotification = await transaction.notification.findFirst({
    where: {
      playIntentId: options.playIntentId,
      userId: options.creatorUserId,
      triggeredByUserId: options.recipientUserId,
      type: NotificationType.SYSTEM
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  if (existingNotification) {
    return transaction.notification.update({
      where: {
        id: existingNotification.id
      },
      data: {
        title: options.title,
        body: options.body
      },
      select: {
        id: true,
        discordDmChannelId: true,
        discordDmMessageId: true
      }
    })
  }

  return transaction.notification.create({
    data: {
      userId: options.creatorUserId,
      triggeredByUserId: options.recipientUserId,
      playIntentId: options.playIntentId,
      gameId: options.gameId,
      type: NotificationType.SYSTEM,
      title: options.title,
      body: options.body
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })
}

export async function deleteCreatorResponseSystemNotifications(options: {
  playIntentId: string;
  creatorUserId: string;
  recipientUserIds: string[];
}) {
  const recipientUserIds = [...new Set(options.recipientUserIds)]

  if (recipientUserIds.length === 0) {
    return
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: options.playIntentId,
      userId: options.creatorUserId,
      triggeredByUserId: {
        in: recipientUserIds
      },
      type: NotificationType.SYSTEM,
      title: {
        in: [
          creatorInterestUpdateSystemNotification.title,
          creatorInterestWithdrawnSystemNotification.title
        ]
      }
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  if (notifications.length === 0) {
    return
  }

  await prisma.notification.deleteMany({
    where: {
      id: {
        in: notifications.map((notification) => notification.id)
      }
    }
  })

  const trackedMessages = new Map<string, { channelId: string; messageId: string }>()

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    trackedMessages.set(
      `${notification.discordDmChannelId}:${notification.discordDmMessageId}`,
      {
        channelId: notification.discordDmChannelId,
        messageId: notification.discordDmMessageId
      }
    )
  }

  await Promise.all(
    [...trackedMessages.values()].map((message) => deleteDiscordDirectMessage(message))
  )
}

async function syncCreatorResponseSystemDirectMessage(options: {
  notificationId: string;
  playIntentId: string;
  discordUserId: string;
  content: string;
  channelId?: string | null;
  messageId?: string | null;
  replaceExisting?: boolean;
}) {
  const replyTo = await getCreatorPlayIntentSummaryReplyReference(options.playIntentId)
  const trackedChannelId = options.channelId ?? null
  const trackedMessageId = options.messageId ?? null

  if (options.replaceExisting && trackedChannelId && trackedMessageId) {
    const resendResult = (await sendDiscordDirectMessages([
      {
        discordUserId: options.discordUserId,
        content: options.content,
        components: [],
        replyTo
      }
    ]))[0]

    if (resendResult?.status === 'sent' && !resendResult.emulated && resendResult.channelId && resendResult.messageId) {
      await prisma.notification.update({
        where: {
          id: options.notificationId
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: resendResult.channelId,
          discordDmMessageId: resendResult.messageId
        }
      })

      if (resendResult.channelId !== trackedChannelId || resendResult.messageId !== trackedMessageId) {
        await deleteDiscordDirectMessage({
          channelId: trackedChannelId,
          messageId: trackedMessageId
        })
      }

      return
    }
  }

  await syncTrackedDiscordDirectMessage({
    tracked: {
      channelId: trackedChannelId,
      messageId: trackedMessageId
    },
    discordUserId: options.discordUserId,
    content: options.content,
    components: [],
    replyTo,
    onMissingTrackedMessage: async () => {
      await prisma.notification.update({
        where: {
          id: options.notificationId
        },
        data: {
          discordDmChannelId: null,
          discordDmMessageId: null
        }
      })
    },
    onSent: async (result) => {
      await prisma.notification.update({
        where: {
          id: options.notificationId
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: result.channelId,
          discordDmMessageId: result.messageId
        }
      })
    }
  })
}

async function syncRecipientResponseFollowUpDirectMessage(options: {
  notificationId: string;
  discordUserId: string;
  content: string;
  channelId?: string | null;
  messageId?: string | null;
  replyTo?: DiscordDirectMessagePayload['replyTo'];
}) {
  await syncTrackedDiscordDirectMessage({
    tracked: {
      channelId: options.channelId,
      messageId: options.messageId
    },
    discordUserId: options.discordUserId,
    content: options.content,
    components: [],
    replyTo: options.replyTo,
    onMissingTrackedMessage: async () => {
      await prisma.notification.update({
        where: {
          id: options.notificationId
        },
        data: {
          recipientResponseDiscordDmChannelId: null,
          recipientResponseDiscordDmMessageId: null
        }
      })
    },
    onSent: async (result) => {
      await prisma.notification.update({
        where: {
          id: options.notificationId
        },
        data: {
          recipientResponseDiscordDmChannelId: result.channelId,
          recipientResponseDiscordDmMessageId: result.messageId
        }
      })
    }
  })
}

function buildPlayIntentGameEmbeds(playIntent: {
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  games: { game: { title: string; coverUrl: string | null } }[];
}) {
  if (playIntent.selectionMode !== 'SELECTED_GAMES' || playIntent.games.length === 0 || playIntent.games.length >= 12) {
    return []
  }

  const gamesWithCover = playIntent.games
    .map((entry) => ({
      title: entry.game.title,
      coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
    }))
    .filter((entry): entry is { title: string; coverUrl: string } => Boolean(entry.coverUrl))

  if (gamesWithCover.length === 0) {
    return []
  }

  if (gamesWithCover.length === 1) {
    const firstGame = gamesWithCover[0]!

    return [{
      title: `Game: ${firstGame.title}`,
      image: { url: firstGame.coverUrl }
    }]
  }

  const firstGame = gamesWithCover[0]!
  const bulletList = gamesWithCover.map((game) => `• ${game.title}`).join('\n')

  return [{
    title: `${gamesWithCover.length} games`,
    description: bulletList,
    image: { url: firstGame.coverUrl }
  }]
}

function parseAction(customId: string): PlayIntentNotificationAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== playIntentNotificationPrefix || !parts[1]) {
    return null
  }

  if (parts[2] === 'interested' || parts[2] === 'join') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.JOIN
    }
  }

  if (parts[2] === 'decline' || parts[2] === 'pass') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.DECLINE
    }
  }

  return null
}

function parseCleanupAction(customId: string): PlayIntentCleanupAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== playIntentNotificationPrefix || !parts[1] || parts[2] !== 'cleanup') {
    return null
  }

  return {
    notificationId: parts[1]
  }
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

  if (parts[2] === 'end') {
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

  if (parts[2] !== 'start-now' && parts[2] !== 'end' && parts[2] !== 'cleanup' && parts[2] !== 'delete-space') {
    return null
  }

  return {
    playIntentId: parts[1],
    action: parts[2]
  }
}

function buildCreatorInterestedNotification(notification: {
  recipientDisplayName: string;
  recipientDiscordUserId: string | null;
  gameTitle: string | null;
}) {
  const recipientDiscordLabel = buildDiscordUserLabel(notification.recipientDisplayName, notification.recipientDiscordUserId)

  return formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: notification.recipientDisplayName,
    recipientLabel: recipientDiscordLabel,
    gameTitle: notification.gameTitle
  })
}

function buildCreatorPassNotification(notification: {
  recipientDisplayName: string;
  recipientDiscordUserId: string | null;
  gameTitle: string | null;
}) {
  const recipientDiscordLabel = buildDiscordUserLabel(notification.recipientDisplayName, notification.recipientDiscordUserId)

  return formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: notification.recipientDisplayName,
    recipientLabel: recipientDiscordLabel,
    gameTitle: notification.gameTitle
  })
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
  const passAcknowledgementMode = getPassAcknowledgementMode(playIntent.scope)
  const responseTransition = resolveRecipientResponseTransition({
    previousChoice,
    response,
    scope: playIntent.scope
  })
  const discordSpace = (await getPlayIntentDiscordSpaceRecipientContexts(playIntent.id, [notification.userId]))
    .get(notification.userId) ?? null

  if (response === NotificationResponseChoice.DECLINE) {
    const creatorNotificationCopy = buildCreatorPassNotification({
      recipientDisplayName: notification.user.displayName,
      recipientDiscordUserId: notification.user.identities?.[0]?.providerUserId ?? null,
      gameTitle: notification.game?.title ?? null
    })
    const shouldCreateCreatorPassNotification = responseTransition.shouldCreateCreatorSystemNotification

    const creatorStatusNotification = shouldCreateCreatorPassNotification
      ? await prisma.$transaction(async (transaction) => {
          await transaction.notification.update({
            where: {
              id: notification.id
            },
            data: {
              respondedAt: new Date(),
              responseChoice: NotificationResponseChoice.DECLINE
            }
          })

          return upsertCreatorResponseSystemNotification(transaction, {
            playIntentId: playIntent.id,
            creatorUserId: playIntent.user.id,
            recipientUserId: notification.userId,
            gameId: notification.gameId,
            title: creatorNotificationCopy.title,
            body: creatorNotificationCopy.body
          })
        })
      : await prisma.notification.update({
          where: {
            id: notification.id
          },
          data: {
            respondedAt: new Date(),
            responseChoice: NotificationResponseChoice.DECLINE
          },
          select: {
            id: true,
            respondedAt: true
          }
        })

    await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
      notifyOnActiveChange: false
    })

    if (shouldCreateCreatorPassNotification && creatorDiscordUserId && 'discordDmChannelId' in creatorStatusNotification) {
      await syncCreatorResponseSystemDirectMessage({
        notificationId: creatorStatusNotification.id,
        playIntentId: playIntent.id,
        discordUserId: creatorDiscordUserId,
        content: buildDiscordPlainMessage(
          buildDiscordMessageHeading(creatorNotificationCopy.title),
          [creatorNotificationCopy.discordBody]
        ),
        channelId: creatorStatusNotification.discordDmChannelId,
        messageId: creatorStatusNotification.discordDmMessageId,
        replaceExisting: responseTransition.shouldReplaceCreatorSystemNotification
      })
    }

    publishPlayIntentInvalidation()

    return {
      content: responseTransition.acknowledgementKind === 'pass-from-join'
        ? buildPassResultMessage(
            `Understood. I marked you as passing.${passAcknowledgementMode === 'creator-notified' ? ` ${playIntent.user.displayName} has been notified.` : ''}`,
            passAcknowledgementMode
          )
        : responseTransition.acknowledgementKind === 'pass-repeat'
          ? buildPassResultMessage('You are still marked as passed on this call to play.', passAcknowledgementMode)
          : buildPassAcceptedMessage(passAcknowledgementMode),
      discordContent: responseTransition.acknowledgementKind === 'pass-from-join'
        ? buildPassResultMessage(
            `Understood. I marked you as passing.${passAcknowledgementMode === 'creator-notified' ? ` ${creatorDiscordLabel} has been notified.` : ''}`,
            passAcknowledgementMode
          )
        : responseTransition.acknowledgementKind === 'pass-repeat'
          ? buildPassResultMessage('You are still marked as passed on this call to play.', passAcknowledgementMode)
          : buildPassAcceptedMessage(passAcknowledgementMode)
    }
  }

  const creatorNotificationCopy = buildCreatorInterestedNotification({
    recipientDisplayName: notification.user.displayName,
    recipientDiscordUserId: notification.user.identities?.[0]?.providerUserId ?? null,
    gameTitle: notification.game?.title ?? null
  })

  const creatorStatusNotification = responseTransition.shouldCreateCreatorSystemNotification
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

        return upsertCreatorResponseSystemNotification(transaction, {
          playIntentId: playIntent.id,
          creatorUserId: playIntent.user.id,
          recipientUserId: notification.userId,
          gameId: notification.gameId,
          title: creatorNotificationCopy.title,
          body: creatorNotificationCopy.body
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
          id: true,
          respondedAt: true
        }
      })

  await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
    notifyOnActiveChange: false
  })

  if (responseTransition.shouldCreateCreatorSystemNotification && creatorDiscordUserId && 'discordDmChannelId' in creatorStatusNotification) {
    await syncCreatorResponseSystemDirectMessage({
      notificationId: creatorStatusNotification.id,
      playIntentId: playIntent.id,
      discordUserId: creatorDiscordUserId,
      content: buildDiscordPlainMessage(
        buildDiscordMessageHeading(creatorNotificationCopy.title),
        [creatorNotificationCopy.discordBody]
      ),
      channelId: creatorStatusNotification.discordDmChannelId,
      messageId: creatorStatusNotification.discordDmMessageId,
      replaceExisting: responseTransition.shouldReplaceCreatorSystemNotification
    })
  }

  if (discordSpace?.inviteUrl && !discordSpace.recipientInServer) {
    await markPlayIntentDiscordSpaceInviteSent(playIntent.id, notification.userId)
  }

  publishPlayIntentInvalidation()

  return {
    content: buildInterestedAcceptedMessage(playIntent.user.displayName, discordSpace),
    discordContent: buildInterestedAcceptedMessage(creatorDiscordLabel, discordSpace)
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
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      }
    },
    select: {
      id: true,
      userId: true,
      gameId: true,
      responseChoice: true,
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
      },
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          id: true,
          scope: true,
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
    responseChoice: options.response === NotificationResponseChoice.JOIN ? 'interested' : 'pass',
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

function isScheduledPlayIntentWindow(windowStartsAt: Date, now: Date) {
  return windowStartsAt.getTime() > now.getTime() + 60 * 1000
}

export class ScheduledPlayIntentStartError extends Error {}

export async function startScheduledPlayIntentNow(playIntentId: string, creatorUserId: string) {
  const now = new Date()

  const startedIntent = await prisma.$transaction(async (transaction) => {
    const playIntent = await transaction.playIntent.findUnique({
      where: {
        id: playIntentId
      },
      select: {
        id: true,
        userId: true,
        deletedAt: true,
        scope: true,
        headline: true,
        selectionMode: true,
        note: true,
        windowStartsAt: true,
        windowEndsAt: true,
        expiresAt: true,
        voiceChannelId: true,
        voiceChannelName: true,
        targetDiscordServers: {
          select: {
            server: {
              select: {
                name: true
              }
            }
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
    })

    if (!playIntent || playIntent.deletedAt || playIntent.userId !== creatorUserId) {
      throw new ScheduledPlayIntentStartError('Call to play not found.')
    }

    if (playIntent.expiresAt <= now || playIntent.windowEndsAt <= now) {
      throw new ScheduledPlayIntentStartError('This call to play is no longer active.')
    }

    if (!isScheduledPlayIntentWindow(playIntent.windowStartsAt, now)) {
      throw new ScheduledPlayIntentStartError('This call to play has already started.')
    }

    await transaction.playIntent.update({
      where: {
        id: playIntent.id
      },
      data: {
        windowStartsAt: now
      }
    })

    const latestCheckIn = await transaction.notification.findFirst({
      where: {
        playIntentId: playIntent.id,
        userId: creatorUserId,
        type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      },
      select: {
        id: true,
        respondedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!latestCheckIn) {
      await transaction.notification.create({
        data: {
          userId: creatorUserId,
          triggeredByUserId: creatorUserId,
          playIntentId: playIntent.id,
          type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
          title: 'Is your scheduled call to play still on?',
          body: 'Your scheduled call to play is starting now. Confirm if it is still on.',
          respondedAt: now,
          responseChoice: NotificationResponseChoice.CONFIRMED
        }
      })
    } else if (!latestCheckIn.respondedAt) {
      await transaction.notification.update({
        where: {
          id: latestCheckIn.id
        },
        data: {
          respondedAt: now,
          responseChoice: NotificationResponseChoice.CONFIRMED
        }
      })
    }

    return {
      id: playIntent.id,
      playIntent,
      result: await createScheduledGoTimeAudienceNotifications(transaction, playIntent)
    }
  })

  await deliverScheduledGoTimeAudienceNotifications({
    playIntent: startedIntent.playIntent,
    result: startedIntent.result
  })

  await refreshTrackedPlayIntentNotificationDirectMessages({
    playIntentIds: [startedIntent.id]
  })

  await syncCreatorPlayIntentSummaryMessages([startedIntent.id], {
    notifyOnActiveChange: false
  })

  publishPlayIntentInvalidation()
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

    await syncCreatorPlayIntentSummaryMessages([intent.id], {
      notifyOnActiveChange: false
    })

    const promptEmbeds = buildScheduledCheckInEmbeds(buildDiscordUserLabel(intent.user.displayName, creatorIdentity.providerUserId))

    const dmResult = await sendCreatorPlayIntentSummaryReply({
      playIntentId: intent.id,
      discordUserId: creatorIdentity.providerUserId,
      content: buildDiscordMessageHeading('⏰ Go-Time Check-In'),
      embeds: promptEmbeds,
      components: buildScheduledPlayIntentCheckInComponents(checkInNotification.id, {
        playIntentId: intent.id
      })
    })

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
  }
}

export async function expirePendingPlayIntentNotifications(
  playIntentIds: string[],
  options: ExpirePendingPlayIntentNotificationsOptions = {}
) {
  if (playIntentIds.length === 0) {
    return
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: playIntentIds
      },
      type: {
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      },
      respondedAt: null
    },
    select: {
      id: true,
      playIntentId: true,
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

    if (notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN) {
      const preservedPrompt = buildScheduledCheckInPromptPreview({
        notificationId: notification.id,
        playIntentId: notification.playIntentId ?? undefined,
        creatorDiscordUserId: notification.playIntent?.user.identities?.[0]?.providerUserId ?? null,
        creatorDisplayName: notification.playIntent?.user.displayName,
        resolved: true
      })

      await editDiscordDirectMessage({
        channelId: notification.discordDmChannelId,
        messageId: notification.discordDmMessageId,
        content: preservedPrompt.content,
        embeds: preservedPrompt.embeds,
        components: []
      })

      const creatorDiscordUserId = notification.playIntent?.user.identities?.[0]?.providerUserId

      if (creatorDiscordUserId && notification.playIntentId) {
        await sendCreatorPlayIntentSummaryReply({
          playIntentId: notification.playIntentId,
          discordUserId: creatorDiscordUserId,
          content: buildExpiredMessage('This call to play expired before you confirmed.'),
          components: []
        })
      }

      return
    }

    const expiredContent = buildExpiredMessage(
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
      components: [buildLinkRow(notification.playIntentId ?? undefined)]
    })
  }))

  await markPlayIntentDiscordSpacesRetained(playIntentIds)
  await syncCreatorPlayIntentSummaryMessages(playIntentIds)
  await archivePlayIntentDirectMessages({
    playIntentIds,
    replaceRecipientMessages: options.notifyAudienceOnEnd === true
  })

  if (options.publishInvalidation !== false) {
    publishPlayIntentInvalidation()
  }
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
            scope: true,
            headline: true,
            selectionMode: true,
            note: true,
            expiresAt: true,
            voiceChannelId: true,
            voiceChannelName: true,
            targetDiscordServers: {
              select: {
                server: {
                  select: {
                    name: true
                  }
                }
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
      components: [buildLinkRow(notification?.playIntentId ?? undefined)]
    })
    return
  }

  if (notification.respondedAt) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(notification.responseChoice),
      components: [buildLinkRow(notification.playIntentId ?? undefined)]
    })
    return
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('This call to play is no longer active.'),
      components: [buildLinkRow(notification.playIntentId ?? undefined)]
    })
    return
  }

  if (action.response === NotificationResponseChoice.CANCELED) {
    const now = new Date()
    const endResult = await prisma.$transaction(async (transaction) => {
      const notificationUpdateResult = await transaction.notification.updateMany({
        where: {
          id: notification.id,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          responseChoice: NotificationResponseChoice.CANCELED
        }
      })

      if (notificationUpdateResult.count === 0 || !notification.playIntentId) {
        return {
          notificationEnded: notificationUpdateResult.count > 0
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
        notificationEnded: true
      }
    })

    if (endResult.notificationEnded && notification.playIntentId) {
      await interaction.deferUpdate()

      await expirePendingPlayIntentNotifications([notification.playIntentId], {
        notifyAudienceOnEnd: true
      })

      return
    }

    if (!endResult.notificationEnded) {
      await interaction.update({
        content: buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CANCELED),
        components: [buildLinkRow(notification.playIntentId ?? undefined)]
      })
      return
    }

    const preservedPrompt = buildScheduledCheckInPromptPreview({
      notificationId: notification.id,
      playIntentId: notification.playIntent.id,
      creatorDiscordUserId: notification.playIntent.user.identities[0]?.providerUserId ?? null,
      creatorDisplayName: notification.playIntent.user.displayName,
      resolved: true
    })

    await interaction.update({
      content: preservedPrompt.content,
      embeds: preservedPrompt.embeds,
      components: preservedPrompt.components
    })
    return
  }

  const playIntent = notification.playIntent

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

    return createScheduledGoTimeAudienceNotifications(transaction, playIntent)
  })

  if (!result) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CONFIRMED),
      components: [buildLinkRow()]
    })
    return
  }

  await deliverScheduledGoTimeAudienceNotifications({
    playIntent,
    result
  })

  const preservedPrompt = buildScheduledCheckInPromptPreview({
    notificationId: notification.id,
    playIntentId: playIntent.id,
    creatorDiscordUserId: playIntent.user.identities[0]?.providerUserId ?? null,
    creatorDisplayName: playIntent.user.displayName,
    resolved: true
  })

  await interaction.update({
    content: preservedPrompt.content,
    embeds: preservedPrompt.embeds,
    components: preservedPrompt.components
  })

  await refreshTrackedPlayIntentNotificationDirectMessages({
    playIntentIds: [playIntent.id]
  })

  await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
    notifyOnActiveChange: false
  })
}

export async function handlePlayIntentNotificationInteraction(interaction: ButtonInteraction) {
  const muteAction = parseMuteAction(interaction.customId)
  if (muteAction) {
    await handlePlayIntentMuteInteraction(interaction, muteAction)
    return
  }

  const cleanupAction = parseCleanupAction(interaction.customId)

  const action = parseAction(interaction.customId)

  if (!cleanupAction && !action) {
    return
  }

  const targetNotificationId = cleanupAction?.notificationId ?? action?.notificationId

  if (!targetNotificationId) {
    return
  }

  const [notification, identity] = await Promise.all([
    prisma.notification.findUnique({
      where: {
        id: targetNotificationId
      },
      select: {
        id: true,
        type: true,
        userId: true,
        triggeredByUserId: true,
        playIntentId: true,
        gameId: true,
        title: true,
        body: true,
        respondedAt: true,
        responseChoice: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
        recipientResponseDiscordDmChannelId: true,
        recipientResponseDiscordDmMessageId: true,
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
            scope: true,
            headline: true,
            selectionMode: true,
            voiceChannelId: true,
            voiceChannelName: true,
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
      components: [buildLinkRow(notification?.playIntentId ?? undefined)]
    })
    return
  }

  if (cleanupAction) {
    if (!notification.playIntentId) {
      await interaction.update({
        content: buildExpiredMessage('These messages are not available for cleanup anymore.'),
        components: [buildLinkRow()]
      })
      return
    }

    await interaction.deferUpdate()
    await deleteUserPlayIntentDirectMessages(notification.playIntentId, notification.userId, {
      anchorMessage: {
        channelId: interaction.channelId,
        messageId: interaction.message.id
      },
      anchorNotificationId: notification.id
    })
    return
  }

  if (!action) {
    return
  }

  if (!notification.playIntentId || !notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('The original call to play is no longer active.'),
      components: [buildLinkRow(notification.playIntentId ?? undefined)]
    })
    return
  }

  const inviteOwnedResponseNotification = notificationUsesInviteOwnedAudienceResponseThread(notification.type)
    ? await prisma.notification.findFirst({
        where: {
          playIntentId: notification.playIntentId,
          userId: notification.userId,
          type: NotificationType.FRIEND_PLAYING
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          userId: true,
          gameId: true,
          responseChoice: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
          recipientResponseDiscordDmChannelId: true,
          recipientResponseDiscordDmMessageId: true,
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
          },
          game: {
            select: {
              title: true
            }
          },
          playIntent: {
            select: {
              id: true,
              scope: true,
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
      })
    : null
  const responseNotification = inviteOwnedResponseNotification ?? notification
  const playIntent = notification.playIntent
  const result = await applyRecipientResponseToPlayIntentNotification({
    notification: responseNotification,
    response: action.response
  })
  const interestedUsers = await getInterestedUsersByPlayIntentId([playIntent.id])
  const interestedUserLabels = (interestedUsers.get(playIntent.id) ?? []).map((user) => buildDiscordUserLabel(
    user.displayName,
    user.identities?.[0]?.providerUserId ?? null
  ))
  const discordSpace = (await getPlayIntentDiscordSpaceRecipientContexts(playIntent.id, [notification.userId]))
    .get(notification.userId) ?? null
  const passAcknowledgementMode = getPassAcknowledgementMode(playIntent.scope)
  const preservedPrompt = buildNotificationDirectMessagePreview({
    notificationId: notification.id,
    playIntentId: playIntent.id,
    notificationType: notification.type,
    title: notification.title,
    body: notification.body,
    responseChoice: action.response,
    creatorUserId: playIntent.user.id,
    creatorDiscordUserId: playIntent.user.identities[0]?.providerUserId ?? null,
    creatorDisplayName: playIntent.user.displayName,
    gameTitle: notification.game?.title ?? null,
    playIntentIsActive: playIntent.expiresAt > new Date(),
    voiceChannel: playIntent.voiceChannelId || playIntent.voiceChannelName
      ? {
          channelId: playIntent.voiceChannelId,
          channelName: playIntent.voiceChannelName,
          recipientSharesServer: true
        }
      : null,
    discordSpace,
    interestedCount: interestedUserLabels.length,
    interestedUserLabels,
    passAcknowledgementMode
  })

  await interaction.update({
    content: preservedPrompt.content,
    embeds: preservedPrompt.embeds,
    components: preservedPrompt.components
  })

  await syncRecipientResponseFollowUpDirectMessage({
    notificationId: responseNotification.id,
    discordUserId: responseNotification.user.identities?.[0]?.providerUserId ?? interaction.user.id,
    content: result.discordContent ?? result.content,
    channelId: responseNotification.recipientResponseDiscordDmChannelId,
    messageId: responseNotification.recipientResponseDiscordDmMessageId,
    replyTo: buildTrackedDirectMessageReplyReference(
      responseNotification.discordDmChannelId,
      responseNotification.discordDmMessageId
    )
  })

  await refreshTrackedPlayIntentNotificationDirectMessages({
    playIntentIds: [playIntent.id]
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

  publishPlayIntentInvalidation()

  await interaction.update({
    content: `Muted ${buildDiscordUserLabel(creatorUser.displayName, creatorUser.identities[0]?.providerUserId)}'s calls to play. You won't see them in your feed.`,
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
        expiresAt: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true
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
      content: 'This call-to-play summary is not available for your account anymore.',
      components: [buildLinkRow()]
    })
    return
  }

  if (action.action === 'cleanup') {
    if (playIntent.expiresAt > new Date()) {
      await interaction.update({
        content: 'This call to play is still active.',
        components: [buildLinkRow()]
      })
      return
    }

    await interaction.deferUpdate()
    await deleteCreatorPlayIntentDirectMessages(playIntent.id, identity.userId, {
      summaryMessage: {
        channelId: interaction.channelId,
        messageId: interaction.message.id
      }
    })
    return
  }

  if (action.action === 'delete-space') {
    if (playIntent.expiresAt > new Date()) {
      await interaction.update({
        content: 'This call to play is still active.',
        components: [buildLinkRow()]
      })
      return
    }

    await interaction.deferUpdate()

    if (
      playIntent.creatorDiscordDmChannelId !== interaction.channelId
      || playIntent.creatorDiscordDmMessageId !== interaction.message.id
    ) {
      await prisma.playIntent.update({
        where: {
          id: playIntent.id
        },
        data: {
          creatorDiscordDmChannelId: interaction.channelId,
          creatorDiscordDmMessageId: interaction.message.id
        }
      })
    }

    await deletePlayIntentDiscordSpaceByPlayIntentId(playIntent.id)
    await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
      notifyOnActiveChange: false
    })
    return
  }

  if (action.action === 'start-now') {
    try {
      await startScheduledPlayIntentNow(playIntent.id, identity.userId)
    } catch (error) {
      if (error instanceof ScheduledPlayIntentStartError) {
        await interaction.update({
          content: error.message,
          components: [buildLinkRow(playIntent.id)]
        })
        return
      }

      throw error
    }
  }

  if (action.action === 'end' && playIntent.expiresAt > new Date()) {
    await interaction.deferUpdate()

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

    await expirePendingPlayIntentNotifications([playIntent.id], {
      notifyAudienceOnEnd: true
    })
    return
  } else if (action.action === 'end') {
    await interaction.deferUpdate()

    await markPlayIntentDiscordSpacesRetained([playIntent.id])
    await archivePlayIntentDirectMessages({
      playIntentIds: [playIntent.id],
      replaceRecipientMessages: true
    })
    return
  }

  const refreshedSnapshot = await getCreatorPlayIntentSummarySnapshot(playIntent.id)
  const currentTime = new Date()

  await interaction.update({
    content: refreshedSnapshot ? '' : 'This call to play already ended.',
    embeds: refreshedSnapshot ? buildCreatorPlayIntentSummaryEmbeds(refreshedSnapshot, currentTime) : [],
    components: refreshedSnapshot
      ? buildCreatorPlayIntentSummaryComponents(
          refreshedSnapshot.id,
          refreshedSnapshot.expiresAt > currentTime,
          isScheduledPlayIntentWindow(refreshedSnapshot.windowStartsAt, currentTime),
          hasCreatorDeletableDiscordSpace(refreshedSnapshot)
        )
      : [buildLinkRow()]
  })
}