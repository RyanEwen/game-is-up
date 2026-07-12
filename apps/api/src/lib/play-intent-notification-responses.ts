/**
 * Recipient-side response handling for call-to-play DM prompts.
 *
 * Owns the full lifecycle for the audience response flow: parsing the custom
 * id from a Discord button click, applying the chosen response transition
 * (interested / pass / decline / join) to the notification row, refreshing
 * the recipient's tracked DM, recording creator/audience SYSTEM status
 * notifications, and resetting state when a substantive play-intent edit
 * invalidates prior responses. Also handles the scheduled go-time check-in
 * flow that converts a prior 'interested' response into 'join' once the call
 * actually starts.
 *
 * SYSTEM status updates are not individual DMs: each recipient has a single
 * per-intent updates-log DM owned by `play-intent-updates-log.ts`, which is
 * deleted and re-sent on every new event so Discord raises a push
 * notification. This module only creates/updates the notification rows and
 * asks the log module to sync.
 */

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
  supportsDiscordInteractiveMessages
} from './discord-bot-runtime.js'
import {
  isMissingDiscordMessageError,
  syncTrackedDiscordDirectMessage
} from './discord-tracked-direct-message.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import {
  appendOpenInAppButton,
  buildDecoratedSectionHeading,
  buildDiscordBulletSection,
  buildDiscordMessageHeading,
  buildDiscordPlainMessage,
  buildDiscordSection,
  buildDiscordSubtext,
  buildOpenInAppButton,
  decorateFieldLabel,
  formatLabeledDiscordLines
} from './discord-dm-formatting.js'
import { toClientGameCoverUrl } from './game-media.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { getInterestedUsersByPlayIntentId, getUpdateEligibleRecipientsByPlayIntentId } from './play-intent-interested-users.js'
import {
  callToPlayEndedSystemNotification,
  formatAudienceInterestUpdateSystemNotification,
  formatAudienceInterestWithdrawnSystemNotification,
  formatAudienceRunningLateSystemNotification,
  creatorInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification,
  creatorRunningLateSystemNotification,
  formatCreatorInterestUpdateSystemNotification,
  formatCreatorInterestWithdrawnSystemNotification,
  formatCreatorRunningLateSystemNotification,
  getPlayIntentSystemNotificationDefinitionByTitle,
  type SystemNotificationCopy
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
import {
  buildPlayIntentUpdatesLogContent,
  buildPlayIntentUpdatesLogEntry,
  getCreatorPlayIntentSummaryReplyReference,
  getPendingResponsePlayIntentPairKeys,
  refreshPlayIntentUpdatesLogDirectMessage,
  syncPlayIntentUpdatesLogDirectMessage,
  type PlayIntentUpdatesLogEntry
} from './play-intent-updates-log.js'
import { prisma } from './prisma.js'
import { formatPlayIntentDateLabel, formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import {
  creatorPlayIntentSummaryPrefix,
  playIntentMutePrefix,
  playIntentNotificationPrefix,
  scheduledPlayIntentCheckInPrefix
} from './play-intent-interaction-ids.js'

type PlayIntentNotificationAction =
  | { notificationId: string; kind: 'response'; response: PlayIntentRecipientResponse }
  | { notificationId: string; kind: 'running-late' }

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
  runningLateAt?: Date | null;
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
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
    _count: { games: number };
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
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_FRIENDS_LIST' | 'SPECIFIC_DISCORD_SERVER';
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
    runningLateAt?: Date | null;
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

  const [recipientIdentities, creatorMemberships] = await Promise.all([
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
              creatorDisplayName: playIntent.user.displayName
            })
          : buildGoTimeConfirmedReplyMessage({
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
  responseCustomIdBuilder?: (response: 'interested' | 'pass' | 'late') => string,
  runningLate = false
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

  // Once interested, offer "I'll be late" until the recipient has flagged it.
  if (responseChoice === NotificationResponseChoice.JOIN && !runningLate) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(responseCustomIdBuilder?.('late') ?? `${playIntentNotificationPrefix}:${notificationId}:late`)
        .setLabel('I\'ll be late')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  if (responseChoice !== NotificationResponseChoice.DECLINE) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(responseCustomIdBuilder?.('pass') ?? `${playIntentNotificationPrefix}:${notificationId}:pass`)
        .setLabel(isGoTimeConfirmed ? 'No longer interested' : "Can't make it")
        .setStyle(ButtonStyle.Secondary)
    )
  }

  if (buttons.length === 0) {
    return null
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)
}

/**
 * How long the pressed response button shows its confirmation label before the
 * prompt settles back to its steady interactive state. Kept short so the message
 * feels responsive rather than stuck.
 */
const RESPONSE_CONFIRMATION_FLASH_MS = 2000

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

type ResponseConfirmationKind = 'interested' | 'pass' | 'late'

const responseConfirmationCopy: Record<ResponseConfirmationKind, { label: string; style: ButtonStyle }> = {
  interested: { label: '✅ You\'re in!', style: ButtonStyle.Success },
  pass: { label: '✅ Got it', style: ButtonStyle.Secondary },
  late: { label: '⏰ Got it — running late', style: ButtonStyle.Secondary }
}

/**
 * Builds the transient message components shown right after a recipient presses a
 * response button: a single disabled button echoing their choice plus the standard
 * open-in-app link. Disabled buttons never emit interactions, so the static custom
 * id is inert. This is the momentary in-place acknowledgement that replaced the
 * separate response follow-up DM.
 */
function buildResponseConfirmationComponents(kind: ResponseConfirmationKind, playIntentId?: string) {
  const copy = responseConfirmationCopy[kind]
  const confirmationRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('play-intent-response-confirmation')
      .setLabel(copy.label)
      .setStyle(copy.style)
      .setDisabled(true)
  )

  return appendOpenInAppButton(
    [confirmationRow],
    buildPlayAppUrl(playIntentId),
    'Open in App'
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
  return buildDecoratedSectionHeading(label)
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
  return decorateFieldLabel(label)
}

export function buildPlayIntentDirectMessageHeading(
  title: string
) {
  return buildDiscordMessageHeading(`🎮 ${title}`)
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

  if (scope === 'SPECIFIC_FRIENDS' || scope === 'SPECIFIC_FRIENDS_LIST') {
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

function buildRecipientDiscordSpacePendingAccessLine() {
  return 'Temporary Discord channel: This call uses a temporary Discord channel. Use the invite to access it.'
}

function buildRecipientVoiceChannelValue(
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null
) {
  const selectedVoiceChannelValue = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `<#${voiceChannel.channelId}>`
      : `#${voiceChannel.channelName}`
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
    discordSpace && !discordSpace.recipientInServer
      ? buildRecipientDiscordSpacePendingAccessLine()
      : null,
    textChannelValue
      ? `Text channel: ${textChannelValue}`
      : null,
    selectedVoiceChannelValue || temporaryVoiceChannelValue
      ? `Voice channel: ${selectedVoiceChannelValue ?? temporaryVoiceChannelValue}`
      : null,
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

// Go-time replies are fresh messages (they must raise a push notification),
// so they name the creator in plain text: Android notifications render <@id>
// mention markup literally. The original invite above carries the mention.
export function buildGoTimeReminderReplyMessage(options: {
  creatorDisplayName?: string | null;
}) {
  const creatorLabel = options.creatorDisplayName?.trim() || 'The creator'

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
  creatorDisplayName?: string | null;
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null;
}) {
  const creatorLabel = options.creatorDisplayName?.trim() || 'The creator'

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
    responseCustomIdBuilder?: (response: 'interested' | 'pass' | 'late') => string;
    runningLate?: boolean;
    discordSpace?: PlayIntentDiscordSpaceRecipientContext | null;
  } = {}
) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  const responseRow = buildResponseRow(
    notificationId,
    responseChoice,
    notificationType,
    options.responseCustomIdBuilder,
    options.runningLate ?? false
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

  // Interested recipients get their temporary Discord space access on the prompt
  // itself. This access used to live on the separate response follow-up DM, which
  // is no longer sent, so surface it here instead.
  if (responseChoice === NotificationResponseChoice.JOIN) {
    rows.push(...buildRecipientDiscordSpaceLinkComponents(options.discordSpace))
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
  responseCustomIdBuilder?: (response: 'interested' | 'pass' | 'late') => string;
  runningLate?: boolean;
  intentDetails?: RecipientPlayIntentDetails;
  summaryStatus?: AudiencePlayIntentSummaryStatus;
}): DirectMessagePreviewPayload {
  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED) {
    return {
      content: buildGoTimeConfirmedReplyMessage({
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
        responseCustomIdBuilder: options.responseCustomIdBuilder,
        runningLate: options.runningLate,
        discordSpace: options.discordSpace
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
  // Plain display name: the check-in is a fresh DM, and Android notifications
  // render <@id> mention markup literally.
  const creatorLabel = options.creatorDisplayName?.trim() || 'there'

  return {
    content: buildDiscordMessageHeading('⏰ Go-Time Check-In'),
    embeds: buildScheduledCheckInEmbeds(creatorLabel),
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
  runningLate?: boolean;
  intentDetails?: RecipientPlayIntentDetails;
  summaryStatus?: AudiencePlayIntentSummaryStatus;
  renderSurface?: 'notification' | 'response';
  /**
   * Sibling SYSTEM entries (newest first) for the recipient's per-intent
   * updates-log DM. When absent, SYSTEM previews render a single-entry log
   * from this notification's own title/body.
   */
  systemLogEntries?: PlayIntentUpdatesLogEntry[];
  /** True when the log recipient has not answered their invite yet, which appends the respond call-to-action line. */
  systemLogShowRespondCallToAction?: boolean;
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
        content: buildPassAcceptedMessage(options.passAcknowledgementMode, creatorLabel),
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
      runningLate: options.runningLate,
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

  if (options.notificationType === NotificationType.SYSTEM) {
    // SYSTEM updates share one per-recipient updates-log DM. Entries use the
    // stored plain-text body (no <@id> mentions) so Android push notifications
    // stay readable; mentions live on the original invite/summary instead.
    return {
      content: buildPlayIntentUpdatesLogContent({
        headline: options.intentDetails?.headline,
        entries: options.systemLogEntries ?? [{ title: options.title, body: options.body }],
        showRespondCallToAction: options.systemLogShowRespondCallToAction
      }),
      components: []
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
    runningLate: boolean;
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
        runningLate: notification.runningLateAt != null,
        interestedUserLabel: notification.user
          ? buildDiscordUserLabel(notification.user.displayName, notification.user.identities?.[0]?.providerUserId)
          : notification.userId
      })
    }
  }

  let interestedCount = 0
  let passedCount = 0
  let waitingCount = 0
  // Players running late are still interested; we split their labels into a
  // separate group so the creator summary lists them apart from on-time interest.
  const interestedUserLabels: string[] = []
  const runningLateUserLabels: string[] = []

  for (const status of latestByUserId.values()) {
    if (status.responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1

      if (status.runningLate) {
        runningLateUserLabels.push(status.interestedUserLabel)
      } else {
        interestedUserLabels.push(status.interestedUserLabel)
      }

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
    runningLateCount: runningLateUserLabels.length,
    runningLateUserLabels,
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
          value: [
            `Interested: ${stats.interestedUserLabels.length}`,
            stats.runningLateCount > 0 ? `Running late: ${stats.runningLateCount}` : null,
            `Passed: ${stats.passedCount}`,
            `Waiting: ${stats.waitingCount}`
          ].filter((line): line is string => line != null).join('\n'),
          inline: true
        },
        {
          name: formatPlayIntentEmbedFieldName('Interested Players'),
          value: stats.interestedUserLabels.length > 0
            ? formatInterestedUserLabelSummary(stats.interestedUserLabels)
            : 'No one yet.',
          inline: false
        },
        ...(stats.runningLateUserLabels.length > 0
          ? [{
              name: formatPlayIntentEmbedFieldName('Running Late'),
              value: formatInterestedUserLabelSummary(stats.runningLateUserLabels),
              inline: false
            }]
          : []),
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
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_FRIENDS_LIST' | 'SPECIFIC_DISCORD_SERVER';
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
          runningLateAt: true,
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

  if (!isActive) {
    // Expired chains are owned by the archive flow (archivePlayIntentDirectMessages);
    // rendering a live summary here would revert the archived "no longer active"
    // message. The archive sweep renders and holds the ended state instead.
    return
  }

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

  if (summaryMessage) {
    await deleteUntrackedCreatorSummaryReplies({
      playIntentId,
      summaryMessage
    })
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
      },
      // Expired chains are owned by the archive flow; refreshing would revert the
      // archived "no longer active" summary back to a live one.
      expiresAt: {
        gt: new Date()
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
  userIds?: string[];
  /**
   * Notification ids whose tracked prompt message should be left untouched. Used
   * when a Discord button interaction has already taken ownership of a message
   * (e.g. to hold a momentary response confirmation) and will restore the steady
   * state itself once the confirmation flash clears.
   */
  excludeNotificationIds?: string[];
} = {}) {
  const targetPlayIntentIds = options.playIntentIds?.filter((playIntentId): playIntentId is string => Boolean(playIntentId)) ?? []
  const targetUserIds = options.userIds?.filter((userId): userId is string => Boolean(userId)) ?? []
  const excludedNotificationIds = new Set(options.excludeNotificationIds ?? [])
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
        : {}),
      ...(targetUserIds.length > 0
        ? {
            userId: {
              in: targetUserIds
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
      runningLateAt: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
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

  // Tracked SYSTEM DMs render the recipient's full updates log, so collect the
  // sibling SYSTEM entries (which mostly carry no DM refs of their own) for
  // every (playIntent, recipient) pair being refreshed.
  const systemLogPairKeys = new Set(
    notifications
      .filter((notification) => (
        notification.type === NotificationType.SYSTEM
        && notification.playIntentId
        && notification.title !== callToPlayEndedSystemNotification.title
      ))
      .map((notification) => `${notification.playIntentId}:${notification.userId}`)
  )
  const systemLogEntriesByPairKey = new Map<string, PlayIntentUpdatesLogEntry[]>()
  let pendingResponsePairKeys = new Set<string>()

  if (systemLogPairKeys.size > 0) {
    const [systemLogRows, recipientTimezoneRows, pendingPairKeys] = await Promise.all([
      prisma.notification.findMany({
        where: {
          type: NotificationType.SYSTEM,
          title: {
            not: callToPlayEndedSystemNotification.title
          },
          playIntentId: {
            in: playIntentIds
          },
          userId: {
            in: recipientUserIds
          }
        },
        orderBy: [
          {
            createdAt: 'desc'
          },
          {
            id: 'desc'
          }
        ],
        select: {
          playIntentId: true,
          userId: true,
          title: true,
          body: true,
          createdAt: true
        }
      }),
      prisma.user.findMany({
        where: {
          id: {
            in: recipientUserIds
          }
        },
        select: {
          id: true,
          timezoneId: true
        }
      }),
      getPendingResponsePlayIntentPairKeys(playIntentIds, recipientUserIds)
    ])

    pendingResponsePairKeys = pendingPairKeys
    const timezoneIdByUserId = new Map(recipientTimezoneRows.map((row) => [row.id, row.timezoneId]))

    for (const row of systemLogRows) {
      const pairKey = `${row.playIntentId}:${row.userId}`

      if (!systemLogPairKeys.has(pairKey)) {
        continue
      }

      const entries = systemLogEntriesByPairKey.get(pairKey) ?? []
      entries.push(buildPlayIntentUpdatesLogEntry(row, timezoneIdByUserId.get(row.userId)))
      systemLogEntriesByPairKey.set(pairKey, entries)
    }
  }

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
  const runningLateRecipientKeys = new Set<string>()

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

    const recipientKey = `${notification.playIntentId}:${notification.userId}`
    latestExplicitAudienceResponseByRecipientKey.set(recipientKey, notification.responseChoice)

    if (notification.runningLateAt) {
      runningLateRecipientKeys.add(recipientKey)
    }
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    if (excludedNotificationIds.has(notification.id)) {
      continue
    }

    const playIntent = notification.playIntent

    if (playIntent && playIntent.expiresAt <= now) {
      // Ended chains are owned by the archive flow; refreshing would revert the
      // archived recipient message back to a live invite.
      continue
    }

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
    const previewRunningLate = previewResponseChoice === NotificationResponseChoice.JOIN
      && notification.playIntentId != null
      && runningLateRecipientKeys.has(`${notification.playIntentId}:${notification.userId}`)
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
      runningLate: previewRunningLate,
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
      actorDiscordUserId: actor?.identities[0]?.providerUserId ?? null,
      systemLogEntries: notification.type === NotificationType.SYSTEM && notification.playIntentId
        ? systemLogEntriesByPairKey.get(`${notification.playIntentId}:${notification.userId}`)
        : undefined,
      systemLogShowRespondCallToAction: notification.type === NotificationType.SYSTEM && notification.playIntentId
        ? pendingResponsePairKeys.has(`${notification.playIntentId}:${notification.userId}`)
        : undefined
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
  const showTextLinks = !supportsDiscordInteractiveMessages()
  const textChannelValue = discordSpace
    ? buildRecipientDiscordSpaceChannelReference({
        channelUrl: discordSpace.textChannelUrl,
        channelName: discordSpace.textChannelName,
        recipientInServer: discordSpace.recipientInServer
      })
    : null
  const complementaryLines = discordSpace
    ? [
        !discordSpace.recipientInServer
          ? buildRecipientDiscordSpacePendingAccessLine()
          : (showTextLinks && textChannelValue ? `Text channel: ${textChannelValue}` : null),
        showTextLinks && !discordSpace.recipientInServer && discordSpace.inviteUrl
          ? `Invite link (shareable): ${discordSpace.inviteUrl}`
          : null,
        showTextLinks && !discordSpace.recipientInServer && discordSpace.inviteUrl
          ? 'Join the server from the invite above to access it.'
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
      trailingSubtext: 'If you change your mind you can switch to "Can\'t make it" later.'
    }
  )
}

function buildRunningLateAcceptedMessage(creatorLabel: string, alreadyLate: boolean) {
  return buildDiscordPlainMessage(
    '⏰ Running Late',
    [
      alreadyLate
        ? `You are already marked as running late. ${creatorLabel} and the other interested players were notified.`
        : `Got it — I let ${creatorLabel} and the other interested players know you are running late.`
    ],
    {
      trailingSubtext: 'You are still marked as interested.'
    }
  )
}

/**
 * Builds the channel-access buttons that accompany an accepted "I'm interested"
 * follow-up. When the recipient already shares the temporary Discord server
 * they get direct text and voice channel links; otherwise they get the
 * shareable invite button in their place. Returns no rows when the guild lacks
 * interactive component support or there is nothing actionable to link.
 */
function buildRecipientDiscordSpaceLinkComponents(
  discordSpace?: PlayIntentDiscordSpaceRecipientContext | null
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (!discordSpace || !supportsDiscordInteractiveMessages()) {
    return []
  }

  const buttons: ButtonBuilder[] = []

  if (discordSpace.recipientInServer) {
    if (discordSpace.textChannelUrl) {
      buttons.push(buildOpenInAppButton(discordSpace.textChannelUrl, 'Text channel'))
    }

    if (discordSpace.voiceChannelUrl) {
      buttons.push(buildOpenInAppButton(discordSpace.voiceChannelUrl, 'Voice channel'))
    }
  } else if (discordSpace.inviteUrl) {
    buttons.push(buildOpenInAppButton(discordSpace.inviteUrl, 'Join Discord'))
  }

  if (buttons.length === 0) {
    return []
  }

  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)]
}

const passAcknowledgementCopyByMode = {
  anonymous: {
    bodyLine: 'Passing is anonymous.',
    subtext: 'Passing is anonymous.'
  },
  'creator-notified': {
    bodyLine: null,
    subtext: 'The creator can see passes for this targeted call to play.'
  }
} as const satisfies Record<PassAcknowledgementMode, { bodyLine: string | null; subtext: string }>

function getPassAcknowledgementMode(scope: PlayIntentScope | null | undefined): PassAcknowledgementMode {
  return scope === PlayIntentScope.SPECIFIC_FRIENDS || scope === PlayIntentScope.SPECIFIC_FRIENDS_LIST ? 'creator-notified' : 'anonymous'
}

function getPassAcknowledgementCopy(mode: PassAcknowledgementMode = 'anonymous') {
  return passAcknowledgementCopyByMode[mode]
}

const passAcknowledgementHeading = '❎ Passed for Now'

function buildPassAcceptedMessage(mode: PassAcknowledgementMode = 'anonymous', creatorLabel?: string | null) {
  const acknowledgementCopy = getPassAcknowledgementCopy(mode)
  const bodyLine = mode === 'creator-notified'
    ? `You are marked as passing for now. ${(creatorLabel ?? 'The creator')} has been notified.`
    : `You are marked as passing for now. ${acknowledgementCopy.bodyLine ?? 'Passing is anonymous.'}`

  return buildDiscordPlainMessage(
    passAcknowledgementHeading,
    [
      bodyLine
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
    passAcknowledgementHeading,
    [
      message
    ],
    {
      trailingSubtext: acknowledgementCopy.subtext
    }
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

/**
 * One SYSTEM status row per (playIntent, recipient, responder): a responder
 * changing their answer updates their existing row instead of stacking new
 * ones. Updates also bump `createdAt` so the row surfaces as the newest entry
 * in the recipient's updates-log DM (and web inbox), which sorts newest-first.
 */
async function upsertCreatorResponseSystemNotification(
  transaction: Prisma.TransactionClient,
  options: {
    playIntentId: string;
    recipientUserId: string;
    triggeredByUserId: string;
    gameId: string | null;
    title: string;
    body: string;
  }
) {
  const existingNotification = await transaction.notification.findFirst({
    where: {
      playIntentId: options.playIntentId,
      userId: options.recipientUserId,
      triggeredByUserId: options.triggeredByUserId,
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
        body: options.body,
        createdAt: new Date()
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
      userId: options.recipientUserId,
      triggeredByUserId: options.triggeredByUserId,
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
          creatorInterestWithdrawnSystemNotification.title,
          creatorRunningLateSystemNotification.title
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

  // The deleted rows may or may not have owned the creator's tracked updates
  // log DM. If a surviving entry still owns it, quietly rewrite the log so it
  // stops listing the removed responses; if the owner was deleted, the next
  // event recreates the log DM from the surviving entries.
  await refreshPlayIntentUpdatesLogDirectMessage({
    playIntentId: options.playIntentId,
    recipientUserId: options.creatorUserId
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
      kind: 'response',
      response: NotificationResponseChoice.JOIN
    }
  }

  if (parts[2] === 'decline' || parts[2] === 'pass') {
    return {
      notificationId: parts[1],
      kind: 'response',
      response: NotificationResponseChoice.DECLINE
    }
  }

  if (parts[2] === 'late') {
    return {
      notificationId: parts[1],
      kind: 'running-late'
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
  gameTitle: string | null;
}) {
  return formatCreatorInterestUpdateSystemNotification({
    recipientDisplayName: notification.recipientDisplayName,
    gameTitle: notification.gameTitle
  })
}

function buildAudienceInterestedNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  return formatAudienceInterestUpdateSystemNotification({
    recipientDisplayName: notification.recipientDisplayName,
    gameTitle: notification.gameTitle
  })
}

function buildCreatorPassNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  return formatCreatorInterestWithdrawnSystemNotification({
    recipientDisplayName: notification.recipientDisplayName,
    gameTitle: notification.gameTitle
  })
}

/**
 * Fans a SYSTEM status notification (web inbox + Discord updates-log DM) out
 * to every other invited recipient on a call to play who has not passed —
 * interested players and not-yet-responded invitees alike — skipping the
 * triggering user and the creator. Used when someone marks interested,
 * passes, or flags that they are running late so the rest of the group stays
 * in sync (and fence-sitters are nudged to respond). Passing removes a
 * recipient from this fan-out, which is what stops their update pings.
 */
async function fanOutAudienceResponseNotifications(options: {
  playIntentId: string;
  triggeredByUserId: string;
  creatorUserId: string;
  gameId: string | null;
  audienceCopy: SystemNotificationCopy;
}) {
  const eligibleRecipientsByPlayIntentId = await getUpdateEligibleRecipientsByPlayIntentId([options.playIntentId])
  const audienceRecipients = (eligibleRecipientsByPlayIntentId.get(options.playIntentId) ?? []).filter((user) => (
    user.id !== options.triggeredByUserId && user.id !== options.creatorUserId
  ))

  if (audienceRecipients.length === 0) {
    return
  }

  await prisma.$transaction((transaction) => Promise.all(
    audienceRecipients.map((user) => upsertCreatorResponseSystemNotification(transaction, {
      playIntentId: options.playIntentId,
      recipientUserId: user.id,
      triggeredByUserId: options.triggeredByUserId,
      gameId: options.gameId,
      title: options.audienceCopy.title,
      body: options.audienceCopy.body
    }))
  ))

  await Promise.all(audienceRecipients.map((user) => {
    const discordUserId = user.identities?.[0]?.providerUserId

    if (!discordUserId) {
      return Promise.resolve()
    }

    return syncPlayIntentUpdatesLogDirectMessage({
      playIntentId: options.playIntentId,
      recipientUserId: user.id,
      discordUserId
    })
  }))
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

  const playIntentCoversSingleGame = playIntent.selectionMode === 'SELECTED_GAMES' && playIntent._count.games === 1
  const responseGameTitle = playIntentCoversSingleGame ? notification.game?.title ?? null : null

  if (response === NotificationResponseChoice.DECLINE) {
    const creatorNotificationCopy = buildCreatorPassNotification({
      recipientDisplayName: notification.user.displayName,
      gameTitle: responseGameTitle
    })
    const shouldCreateCreatorPassNotification = responseTransition.shouldCreateCreatorSystemNotification

    if (shouldCreateCreatorPassNotification) {
      await prisma.$transaction(async (transaction) => {
        await transaction.notification.update({
          where: {
            id: notification.id
          },
          data: {
            respondedAt: new Date(),
            responseChoice: NotificationResponseChoice.DECLINE,
            runningLateAt: null
          }
        })

        await upsertCreatorResponseSystemNotification(transaction, {
          playIntentId: playIntent.id,
          recipientUserId: playIntent.user.id,
          triggeredByUserId: notification.userId,
          gameId: notification.gameId,
          title: creatorNotificationCopy.title,
          body: creatorNotificationCopy.body
        })
      })
    } else {
      await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          respondedAt: new Date(),
          responseChoice: NotificationResponseChoice.DECLINE,
          runningLateAt: null
        },
        select: {
          id: true,
          respondedAt: true
        }
      })
    }

    await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
      notifyOnActiveChange: false
    })

    if (shouldCreateCreatorPassNotification && creatorDiscordUserId) {
      await syncPlayIntentUpdatesLogDirectMessage({
        playIntentId: playIntent.id,
        recipientUserId: playIntent.user.id,
        discordUserId: creatorDiscordUserId
      })
    }

    if (shouldCreateCreatorPassNotification) {
      await fanOutAudienceResponseNotifications({
        playIntentId: playIntent.id,
        triggeredByUserId: notification.userId,
        creatorUserId: playIntent.user.id,
        gameId: notification.gameId,
        audienceCopy: formatAudienceInterestWithdrawnSystemNotification({
          recipientDisplayName: notification.user.displayName,
          gameTitle: responseGameTitle
        })
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
          : buildPassAcceptedMessage(passAcknowledgementMode, playIntent.user.displayName),
      discordContent: responseTransition.acknowledgementKind === 'pass-from-join'
        ? buildPassResultMessage(
            `Understood. I marked you as passing.${passAcknowledgementMode === 'creator-notified' ? ` ${creatorDiscordLabel} has been notified.` : ''}`,
            passAcknowledgementMode
          )
        : responseTransition.acknowledgementKind === 'pass-repeat'
          ? buildPassResultMessage('You are still marked as passed on this call to play.', passAcknowledgementMode)
          : buildPassAcceptedMessage(passAcknowledgementMode, creatorDiscordLabel),
      discordComponents: [] as ActionRowBuilder<MessageActionRowComponentBuilder>[]
    }
  }

  const creatorNotificationCopy = buildCreatorInterestedNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: responseGameTitle
  })
  const audienceNotificationCopy = buildAudienceInterestedNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: responseGameTitle
  })

  if (responseTransition.shouldCreateCreatorSystemNotification) {
    await prisma.$transaction(async (transaction) => {
      await transaction.notification.update({
        where: {
          id: notification.id
        },
        data: {
          respondedAt: new Date(),
          responseChoice: NotificationResponseChoice.JOIN
        }
      })

      await upsertCreatorResponseSystemNotification(transaction, {
        playIntentId: playIntent.id,
        recipientUserId: playIntent.user.id,
        triggeredByUserId: notification.userId,
        gameId: notification.gameId,
        title: creatorNotificationCopy.title,
        body: creatorNotificationCopy.body
      })
    })
  } else {
    await prisma.notification.update({
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
  }

  await syncCreatorPlayIntentSummaryMessages([playIntent.id], {
    notifyOnActiveChange: false
  })

  if (responseTransition.shouldCreateCreatorSystemNotification && creatorDiscordUserId) {
    await syncPlayIntentUpdatesLogDirectMessage({
      playIntentId: playIntent.id,
      recipientUserId: playIntent.user.id,
      discordUserId: creatorDiscordUserId
    })
  }

  if (responseTransition.shouldCreateCreatorSystemNotification) {
    await fanOutAudienceResponseNotifications({
      playIntentId: playIntent.id,
      triggeredByUserId: notification.userId,
      creatorUserId: playIntent.user.id,
      gameId: notification.gameId,
      audienceCopy: audienceNotificationCopy
    })
  }

  if (discordSpace?.inviteUrl && !discordSpace.recipientInServer) {
    await markPlayIntentDiscordSpaceInviteSent(playIntent.id, notification.userId)
  }

  publishPlayIntentInvalidation()

  return {
    content: buildInterestedAcceptedMessage(playIntent.user.displayName, discordSpace),
    discordContent: buildInterestedAcceptedMessage(creatorDiscordLabel, discordSpace),
    discordComponents: buildRecipientDiscordSpaceLinkComponents(discordSpace)
  }
}

/**
 * Flags an interested recipient as running late and notifies the creator plus
 * every other interested recipient. "Running late" is a modifier on an existing
 * interested response, so it requires a prior JOIN and never changes the stored
 * response choice. Repeat flags are idempotent and do not re-notify.
 */
async function applyRunningLateToPlayIntentNotification(options: {
  notification: ResolvablePlayIntentNotification;
}) {
  const { notification } = options

  if (!notification.playIntent) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  if (notification.responseChoice !== NotificationResponseChoice.JOIN) {
    throw new PlayIntentNotificationResponseError(409, 'Mark yourself interested before letting everyone know you will be late.')
  }

  const playIntent = notification.playIntent
  const creatorDiscordUserId = playIntent.user.identities?.[0]?.providerUserId ?? null
  const creatorDiscordLabel = buildDiscordUserLabel(playIntent.user.displayName, creatorDiscordUserId)
  const alreadyLate = notification.runningLateAt != null

  const noOpResult = {
    content: buildRunningLateAcceptedMessage(playIntent.user.displayName, true),
    discordContent: buildRunningLateAcceptedMessage(creatorDiscordLabel, true),
    discordComponents: [] as ActionRowBuilder<MessageActionRowComponentBuilder>[]
  }

  if (alreadyLate) {
    return noOpResult
  }

  const playIntentCoversSingleGame = playIntent.selectionMode === 'SELECTED_GAMES' && playIntent._count.games === 1
  const responseGameTitle = playIntentCoversSingleGame ? notification.game?.title ?? null : null

  const creatorNotificationCopy = formatCreatorRunningLateSystemNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: responseGameTitle
  })
  const audienceNotificationCopy = formatAudienceRunningLateSystemNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: responseGameTitle
  })

  await prisma.$transaction(async (transaction) => {
    await transaction.notification.update({
      where: {
        id: notification.id
      },
      data: {
        runningLateAt: new Date()
      }
    })

    await upsertCreatorResponseSystemNotification(transaction, {
      playIntentId: playIntent.id,
      recipientUserId: playIntent.user.id,
      triggeredByUserId: notification.userId,
      gameId: notification.gameId,
      title: creatorNotificationCopy.title,
      body: creatorNotificationCopy.body
    })
  })

  if (creatorDiscordUserId) {
    await syncPlayIntentUpdatesLogDirectMessage({
      playIntentId: playIntent.id,
      recipientUserId: playIntent.user.id,
      discordUserId: creatorDiscordUserId
    })
  }

  await fanOutAudienceResponseNotifications({
    playIntentId: playIntent.id,
    triggeredByUserId: notification.userId,
    creatorUserId: playIntent.user.id,
    gameId: notification.gameId,
    audienceCopy: audienceNotificationCopy
  })

  publishPlayIntentInvalidation()

  return {
    content: buildRunningLateAcceptedMessage(playIntent.user.displayName, false),
    discordContent: buildRunningLateAcceptedMessage(creatorDiscordLabel, false),
    discordComponents: [] as ActionRowBuilder<MessageActionRowComponentBuilder>[]
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
      discordDmChannelId: true,
      discordDmMessageId: true,
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
          selectionMode: true,
          expiresAt: true,
          _count: {
            select: { games: true }
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

  await refreshTrackedPlayIntentNotificationDirectMessages({
    playIntentIds: [notification.playIntent.id]
  })

  return {
    responseChoice: options.response === NotificationResponseChoice.JOIN ? 'interested' : 'pass',
    message: result.content
  }
}

/**
 * Web entry point for "I'll be late". Loads the viewer's recipient notification,
 * flags it as running late, and fans the update out to the creator and other
 * interested players. Returns a `late` result so the client can surface the
 * running-late acknowledgement.
 */
export async function markRunningLateFromWeb(options: {
  userId: string;
  playIntentId: string;
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
      runningLateAt: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
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
          selectionMode: true,
          expiresAt: true,
          _count: {
            select: { games: true }
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
      createdAt: 'desc'
    }
  })

  if (!notification) {
    throw new PlayIntentNotificationResponseError(404, 'No active response prompt was found for this call to play.')
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  const result = await applyRunningLateToPlayIntentNotification({ notification })

  await refreshTrackedPlayIntentNotificationDirectMessages({
    playIntentIds: [notification.playIntent.id]
  })

  return {
    responseChoice: 'late' as const,
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

    const promptEmbeds = buildScheduledCheckInEmbeds(intent.user.displayName)

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
    playIntentIds
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

      await expirePendingPlayIntentNotifications([notification.playIntentId])

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
        runningLateAt: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
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
            _count: {
              select: { games: true }
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
          runningLateAt: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
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
              selectionMode: true,
              _count: {
                select: { games: true }
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
        }
      })
    : null
  const responseNotification = inviteOwnedResponseNotification ?? notification
  const playIntent = notification.playIntent

  if (action.kind === 'running-late' && responseNotification.responseChoice !== NotificationResponseChoice.JOIN) {
    await interaction.update({
      content: buildExpiredMessage('Mark yourself interested before letting everyone know you will be late.'),
      components: [buildLinkRow(playIntent.id)]
    })
    return
  }

  if (action.kind === 'running-late') {
    await applyRunningLateToPlayIntentNotification({
      notification: responseNotification
    })
  } else {
    await applyRecipientResponseToPlayIntentNotification({
      notification: responseNotification,
      response: action.response
    })
  }
  const preservedResponseChoice = action.kind === 'running-late'
    ? NotificationResponseChoice.JOIN
    : action.response
  const preservedRunningLate = action.kind === 'running-late'
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
    responseChoice: preservedResponseChoice,
    runningLate: preservedRunningLate,
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

  const steadyEmbeds = notification.type === NotificationType.FRIEND_PLAYING
    ? [
        ...(preservedPrompt.embeds ?? []),
        ...buildPlayIntentGameEmbeds(playIntent)
      ]
    : preservedPrompt.embeds
  const confirmationKind: ResponseConfirmationKind = action.kind === 'running-late'
    ? 'late'
    : action.response === NotificationResponseChoice.JOIN ? 'interested' : 'pass'

  // Acknowledge the click by flashing a short confirmation on the pressed button
  // instead of sending a separate "You're In" follow-up DM. The pressed message is
  // held out of the tracked refresh below so the flash is not immediately
  // overwritten, then restored to the steady prompt once the flash clears.
  await interaction.update({
    content: preservedPrompt.content,
    embeds: steadyEmbeds,
    components: buildResponseConfirmationComponents(confirmationKind, playIntent.id)
  })

  // allSettled so a refresh failure can never strand the message on the flash
  // state: the pressed button must always settle back to the steady prompt.
  await Promise.allSettled([
    refreshTrackedPlayIntentNotificationDirectMessages({
      playIntentIds: [playIntent.id],
      excludeNotificationIds: [notification.id, responseNotification.id]
    }),
    delay(RESPONSE_CONFIRMATION_FLASH_MS)
  ])

  try {
    await interaction.editReply({
      content: preservedPrompt.content,
      embeds: steadyEmbeds,
      components: preservedPrompt.components
    })
  } catch {
    // The recipient may have dismissed or navigated away from the DM before the
    // flash cleared. The next tracked refresh restores the steady prompt, so the
    // failed edit is safe to ignore.
  }
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

    await expirePendingPlayIntentNotifications([playIntent.id])
    return
  } else if (action.action === 'end') {
    await interaction.deferUpdate()

    await markPlayIntentDiscordSpacesRetained([playIntent.id])
    await archivePlayIntentDirectMessages({
      playIntentIds: [playIntent.id]
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