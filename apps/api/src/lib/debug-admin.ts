import { debugAdminResponseSchema } from '@game-is-up/shared'
import {
  AuthProvider,
  DiscordAutoPlayPromptStatus,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode
} from '@prisma/client'
import { buildDiscordAutoPlayPromptPreview } from './discord-auto-play-prompts.js'
import { buildDebugPlayIntentResponseCustomId } from './debug-dm-actions.js'
import { buildDebugDmPreview } from './discord-dm-preview.js'
import { areDiscordDirectMessagesEmulated, getDiscordPresenceBotState } from './discord-bot-runtime.js'
import { env } from './env.js'
import { getPlayIntentRecipientUserIdsForDebug } from './play-intents.js'
import { buildPlayIntentNotificationCopy } from './play-intents.js'
import { buildCreatorPlayIntentSummaryPreview, buildNotificationDirectMessagePreview, buildPlayIntentDirectMessage } from './play-intent-notification-responses.js'
import { prisma } from './prisma.js'

type DebugDmPreviewPayload = ReturnType<typeof buildDebugDmPreview>

type DebugDmRevisionDraft = {
  occurredAt: string;
  preview: DebugDmPreviewPayload;
}

function areDebugDmPreviewsEqual(left: DebugDmPreviewPayload, right: DebugDmPreviewPayload) {
  return left.content === right.content && JSON.stringify(left.buttonRows) === JSON.stringify(right.buttonRows)
}

function finalizeDmRevisions(baseId: string, revisions: DebugDmRevisionDraft[]) {
  const sortedRevisions = [...revisions].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
  const dedupedRevisions = sortedRevisions.filter((revision, index) => {
    const previousRevision = sortedRevisions[index - 1]
    return !previousRevision || !areDebugDmPreviewsEqual(previousRevision.preview, revision.preview)
  })

  return dedupedRevisions.map((revision, index) => ({
    id: `${baseId}:revision:${index + 1}`,
    label: dedupedRevisions.length === 1
      ? 'Latest state'
      : index === 0
        ? 'Initial send'
        : index === dedupedRevisions.length - 1
          ? 'Latest state'
          : `Update ${index}`,
    occurredAt: revision.occurredAt,
    preview: revision.preview
  }))
}

function getLatestMessageActivityAt(messages: Array<{ sentAt: string; revisions: Array<{ occurredAt: string }> }>) {
  return getLatestActivityAt(messages.map((message) => new Date(message.revisions[message.revisions.length - 1]?.occurredAt ?? message.sentAt)))
}

function getLatestRevisionPreview(revisions: Array<{ preview: DebugDmPreviewPayload }>) {
  const latestRevision = revisions[revisions.length - 1] ?? revisions[0]

  if (!latestRevision) {
    throw new Error('Expected at least one DM revision in the debug snapshot.')
  }

  return latestRevision.preview
}

function toCreatorSummaryNotificationsAtTime(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }>,
  currentTime: Date
) {
  return notifications
    .filter((notification) => notification.createdAt.getTime() <= currentTime.getTime())
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((notification) => ({
      userId: notification.userId,
      type: notification.type,
      respondedAt: notification.respondedAt && notification.respondedAt.getTime() <= currentTime.getTime()
        ? notification.respondedAt
        : null,
      responseChoice: notification.respondedAt && notification.respondedAt.getTime() <= currentTime.getTime()
        ? notification.responseChoice
        : null,
      deliveredAt: notification.deliveredAt && notification.deliveredAt.getTime() <= currentTime.getTime()
        ? notification.deliveredAt
        : null,
      createdAt: notification.createdAt
    }))
}

function buildCreatorSummaryRevisions(intent: {
  createdAt: Date;
  id: string;
  headline: string;
  note: string;
  selectionMode: PlayIntentSelectionMode;
  scope: PlayIntentScope;
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
  targetFriends: Array<{
    friendUser: {
      displayName: string;
      identities: { providerUserId: string }[];
    };
  }>;
  games: Array<{
    game: {
      title: string;
    };
  }>;
  notifications: Array<{
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }>;
}, now: Date) {
  const revisionTimestamps = new Set<number>([intent.createdAt.getTime()])

  for (const notification of intent.notifications) {
    revisionTimestamps.add(notification.createdAt.getTime())

    if (notification.deliveredAt) {
      revisionTimestamps.add(notification.deliveredAt.getTime())
    }

    if (notification.respondedAt) {
      revisionTimestamps.add(notification.respondedAt.getTime())
    }
  }

  if (intent.expiresAt.getTime() <= now.getTime()) {
    revisionTimestamps.add(intent.expiresAt.getTime())
  }

  return finalizeDmRevisions(
    `creator-summary:${intent.id}`,
    [...revisionTimestamps]
      .sort((left, right) => left - right)
      .map((timestamp) => {
        const currentTime = new Date(timestamp)
        const previewPayload = buildCreatorPlayIntentSummaryPreview({
          id: intent.id,
          headline: intent.headline,
          note: intent.note,
          selectionMode: intent.selectionMode,
          scope: intent.scope,
          windowStartsAt: intent.windowStartsAt,
          windowEndsAt: intent.windowEndsAt,
          expiresAt: intent.expiresAt,
          voiceChannelName: intent.voiceChannelName,
          user: intent.user,
          targetDiscordServer: intent.targetDiscordServer,
          targetFriends: intent.targetFriends,
          games: intent.games,
          notifications: toCreatorSummaryNotificationsAtTime(intent.notifications, currentTime),
          currentTime
        })

        return {
          occurredAt: currentTime.toISOString(),
          preview: buildDebugDmPreview(previewPayload.content, previewPayload.components)
        }
      })
  )
}

function buildNotificationMessageRevisions(options: {
  messageId: string;
  notification: {
    id: string;
    createdAt: Date;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    type: NotificationType;
    title: string;
    body: string;
    userId: string;
    game: {
      title: string;
    } | null;
  };
  creatorUserId: string;
  creatorDiscordUserId: string | null;
  creatorDisplayName: string;
  gameTitle: string | null;
  voiceChannel: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  joinCount?: number;
}) {
  const basePreviewOptions = {
    notificationId: options.notification.id,
    notificationType: options.notification.type,
    title: options.notification.title,
    body: options.notification.body,
    creatorUserId: options.creatorUserId,
    creatorDiscordUserId: options.creatorDiscordUserId,
    creatorDisplayName: options.creatorDisplayName,
    gameTitle: options.gameTitle,
    voiceChannel: options.voiceChannel,
    joinCount: options.joinCount
  }
  const revisions: DebugDmRevisionDraft[] = [{
    occurredAt: options.notification.createdAt.toISOString(),
    preview: buildDebugDmPreview(
      buildNotificationDirectMessagePreview({
        ...basePreviewOptions,
        responseChoice: null,
        playIntentIsActive: true
      }).content,
      buildNotificationDirectMessagePreview({
        ...basePreviewOptions,
        responseChoice: null,
        playIntentIsActive: true
      }).components
    )
  }]

  if (options.notification.responseChoice && options.notification.respondedAt) {
    const resolvedPreview = buildNotificationDirectMessagePreview({
      ...basePreviewOptions,
      responseChoice: options.notification.responseChoice,
      playIntentIsActive: options.notification.responseChoice === NotificationResponseChoice.EXPIRED ? false : true
    })

    revisions.push({
      occurredAt: options.notification.respondedAt.toISOString(),
      preview: buildDebugDmPreview(resolvedPreview.content, resolvedPreview.components)
    })
  }

  return finalizeDmRevisions(options.messageId, revisions)
}

function toClientPromptStatus(status: DiscordAutoPlayPromptStatus) {
  switch (status) {
    case DiscordAutoPlayPromptStatus.ACCEPTED:
      return 'accepted'
    case DiscordAutoPlayPromptStatus.DECLINED:
      return 'declined'
    case DiscordAutoPlayPromptStatus.EXPIRED:
      return 'expired'
    case DiscordAutoPlayPromptStatus.FAILED:
      return 'failed'
    case DiscordAutoPlayPromptStatus.SKIPPED:
      return 'skipped'
    case DiscordAutoPlayPromptStatus.SETTLE_SENT:
      return 'settle_sent'
    case DiscordAutoPlayPromptStatus.SETTLE_CONFIRMED:
      return 'settle_confirmed'
    case DiscordAutoPlayPromptStatus.SETTLE_DECLINED:
      return 'settle_declined'
    default:
      return 'sent'
  }
}

function toClientNotifyScope(scope: PlayIntentScope | null) {
  if (!scope) {
    return null
  }

  switch (scope) {
    case PlayIntentScope.FRIENDS_ONLY:
      return 'friends-only'
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return 'specific-discord-server'
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends'
    default:
      return 'network'
  }
}

function toClientSelectionMode(selectionMode: PlayIntentSelectionMode) {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toNotificationTypeLabel(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.FRIEND_PLAYING:
      return 'Friend playing notification'
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'Scheduled check-in'
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'Go-time confirmed'
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'Go-time reminder'
    case NotificationType.MUTUAL_FRIEND:
      return 'Mutual friend notification'
    default:
      return 'System notification'
  }
}

function getInterestedCountBeforeNotification(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    createdAt: Date;
    responseChoice: NotificationResponseChoice | null;
  }>,
  cutoff: Date
) {
  const latestByUserId = new Map<string, NotificationResponseChoice | null>()

  const sortedNotifications = notifications
    .filter((notification) =>
      (notification.type === NotificationType.FRIEND_PLAYING || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER)
      && notification.createdAt.getTime() < cutoff.getTime()
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())

  for (const notification of sortedNotifications) {
    if (!latestByUserId.has(notification.userId)) {
      latestByUserId.set(notification.userId, notification.responseChoice)
    }
  }

  let interestedCount = 0

  for (const responseChoice of latestByUserId.values()) {
    if (responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1
    }
  }

  return interestedCount
}

function toDebugDmDeliveryState(deliveredAt: Date | null, emulated = false) {
  if (emulated) {
    return 'emulated' as const
  }

  return deliveredAt ? 'dm-delivered' as const : 'stored-only' as const
}

function getLatestActivityAt(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime())

  if (timestamps.length === 0) {
    return null
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function toInboxMessageKind(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'scheduled-check-in' as const
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'go-time-confirmed' as const
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'go-time-reminder' as const
    default:
      return 'call-to-play' as const
  }
}

function toInboxMessageLabel(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'Scheduled check-in'
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'Go-time confirmed'
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'Go-time reminder'
    default:
      return 'Call to play'
  }
}

export async function buildDebugAdminSnapshot() {
  const now = new Date()
  const [recentAutoPlayPrompts, recentNotifications, recentPlayIntents] = await Promise.all([
    prisma.discordAutoPlayPrompt.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            discordAutoPromptPlayIntent: true
          }
        },
        game: {
          select: {
            id: true,
            title: true
          }
        },
        sourceServer: {
          select: {
            name: true
          }
        },
        createdPlayIntent: {
          select: {
            notifications: {
              where: {
                type: NotificationType.FRIEND_PLAYING,
                deliveredAt: {
                  not: null
                }
              },
              select: {
                id: true
              }
            }
          }
        },
        observation: {
          select: {
            startedAt: true
          }
        }
      }
    }),
    prisma.notification.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
        responseChoice: true,
        type: true,
        playIntentId: true,
        title: true,
        body: true,
        triggeredByUserId: true,
        game: {
          select: {
            title: true
          }
        },
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        }
      }
    }),
    prisma.playIntent.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 250,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        },
        targetDiscordServer: {
          select: {
            id: true,
            name: true
          }
        },
        games: {
          select: {
            game: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        platforms: {
          select: {
            platformLabel: true
          }
        },
        targetFriends: {
          select: {
            friendUser: {
              select: {
                id: true,
                handle: true,
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
            }
          }
        },
        notifications: {
          select: {
            id: true,
            userId: true,
            createdAt: true,
            deliveredAt: true,
            respondedAt: true,
            responseChoice: true,
            type: true,
            title: true,
            body: true,
            triggeredByUserId: true,
            game: {
              select: {
                title: true
              }
            },
            user: {
              select: {
                id: true,
                handle: true,
                displayName: true,
                timezoneId: true
              }
            }
          }
        }
      }
    })
  ])

  const playIntentIds = recentPlayIntents.map((intent) => intent.id)
  const librarySelectionCreatorUserIds = [...new Set(
    recentPlayIntents
      .filter((intent) => intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY)
      .map((intent) => intent.user.id)
  )]
  const previewPlayIntentIds = [...new Set([
    ...recentNotifications.map((notification) => notification.playIntentId),
    ...recentAutoPlayPrompts.map((prompt) => prompt.createdPlayIntentId)
  ].filter((playIntentId): playIntentId is string => Boolean(playIntentId)))]
  const playIntentAutoPrompts = playIntentIds.length > 0
    ? await prisma.discordAutoPlayPrompt.findMany({
        where: {
          createdPlayIntentId: {
            in: playIntentIds
          }
        },
        include: {
          user: {
            select: {
              displayName: true
            }
          },
          game: {
            select: {
              title: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      })
    : []
  const previewPlayIntents = previewPlayIntentIds.length > 0
    ? await prisma.playIntent.findMany({
        where: {
          id: {
            in: previewPlayIntentIds
          }
        },
        select: {
          id: true,
          userId: true,
          voiceChannelId: true,
          voiceChannelName: true,
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
          },
          notifications: {
            select: {
              userId: true,
              type: true,
              createdAt: true,
              responseChoice: true
            }
          }
        }
      })
    : []
  const creatorUserIdsWithVoiceChannels = [...new Set(
    previewPlayIntents
      .filter((intent) => Boolean(intent.voiceChannelId))
      .map((intent) => intent.userId)
  )]
  const notificationRecipientUserIds = [...new Set(recentNotifications.map((notification) => notification.user.id))]
  const [creatorServerMemberships, recipientServerMemberships] = await Promise.all([
    creatorUserIdsWithVoiceChannels.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: {
              in: creatorUserIdsWithVoiceChannels
            }
          },
          select: {
            userId: true,
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ userId: string; serverId: string }>),
    notificationRecipientUserIds.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: {
              in: notificationRecipientUserIds
            }
          },
          select: {
            userId: true,
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ userId: string; serverId: string }>)
  ])
  const creatorLibraryEntries = librarySelectionCreatorUserIds.length > 0
    ? await prisma.userGameInterest.findMany({
        where: {
          userId: {
            in: librarySelectionCreatorUserIds
          },
          intentType: {
            not: 'COMPLETED'
          }
        },
        select: {
          userId: true,
          gameId: true
        }
      })
    : []
  const creatorLibraryGameIdsByUserId = new Map<string, string[]>()
  for (const entry of creatorLibraryEntries) {
    const existing = creatorLibraryGameIdsByUserId.get(entry.userId) ?? []
    existing.push(entry.gameId)
    creatorLibraryGameIdsByUserId.set(entry.userId, existing)
  }
  const triggeredByUserIds = [...new Set([
    ...recentNotifications.map((notification) => notification.triggeredByUserId),
    ...recentPlayIntents.flatMap((intent) => intent.notifications.map((notification) => notification.triggeredByUserId))
  ].filter((userId): userId is string => Boolean(userId)))]
  const triggeredByUsers = triggeredByUserIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: triggeredByUserIds
          }
        },
        select: {
          id: true,
          handle: true,
          displayName: true
        }
      })
    : []
  const triggeredByUserMap = new Map(triggeredByUsers.map((user) => [user.id, user]))
  const previewPlayIntentMap = new Map(previewPlayIntents.map((intent) => [intent.id, intent]))
  const autoPromptIdsByPlayIntentId = new Map<string, string[]>()
  const creatorServerIdsByUserId = new Map<string, Set<string>>()
  const recipientServerIdsByUserId = new Map<string, Set<string>>()

  for (const membership of creatorServerMemberships) {
    const existingServerIds = creatorServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    existingServerIds.add(membership.serverId)
    creatorServerIdsByUserId.set(membership.userId, existingServerIds)
  }

  for (const membership of recipientServerMemberships) {
    const existingServerIds = recipientServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    existingServerIds.add(membership.serverId)
    recipientServerIdsByUserId.set(membership.userId, existingServerIds)
  }

  for (const prompt of playIntentAutoPrompts) {
    if (!prompt.createdPlayIntentId) {
      continue
    }

    const existingPromptIds = autoPromptIdsByPlayIntentId.get(prompt.createdPlayIntentId) ?? []
    existingPromptIds.push(prompt.id)
    autoPromptIdsByPlayIntentId.set(prompt.createdPlayIntentId, existingPromptIds)
  }

  const lifecycleEvents = recentPlayIntents.flatMap((intent) => {
    const events: Array<{
      id: string;
      playIntentId: string;
      occurredAt: string;
      source: 'play-intent' | 'notification' | 'auto-play-prompt' | 'system';
      eventType: string;
      summary: string;
      details: string | null;
      isError: boolean;
      notificationId: string | null;
      promptId: string | null;
      actorDisplayName: string | null;
      recipientDisplayName: string | null;
    }> = []

    events.push({
      id: `play-intent:${intent.id}:created`,
      playIntentId: intent.id,
      occurredAt: intent.createdAt.toISOString(),
      source: 'play-intent',
      eventType: 'created',
      summary: 'Call to play created',
      details: `${intent.user.displayName} created this call to play.`,
      isError: false,
      notificationId: null,
      promptId: null,
      actorDisplayName: intent.user.displayName,
      recipientDisplayName: null
    })

    if (intent.windowStartsAt.getTime() > intent.createdAt.getTime() + 60 * 1000) {
      events.push({
        id: `play-intent:${intent.id}:window-start`,
        playIntentId: intent.id,
        occurredAt: intent.windowStartsAt.toISOString(),
        source: 'play-intent',
        eventType: 'scheduled-start',
        summary: 'Scheduled start time reached',
        details: `The scheduled session window opened for ${intent.user.displayName}.`,
        isError: false,
        notificationId: null,
        promptId: null,
        actorDisplayName: intent.user.displayName,
        recipientDisplayName: null
      })
    }

    const intentPrompts = playIntentAutoPrompts.filter((prompt) => prompt.createdPlayIntentId === intent.id)
    for (const prompt of intentPrompts) {
      events.push({
        id: `auto-play-prompt:${prompt.id}:created`,
        playIntentId: intent.id,
        occurredAt: prompt.createdAt.toISOString(),
        source: 'auto-play-prompt',
        eventType: 'prompt-created',
        summary: 'Auto-play prompt recorded',
        details: `${prompt.user.displayName} · ${prompt.game.title} · status ${toClientPromptStatus(prompt.status)}.`,
        isError: prompt.status === DiscordAutoPlayPromptStatus.FAILED || Boolean(prompt.dmError),
        notificationId: null,
        promptId: prompt.id,
        actorDisplayName: prompt.user.displayName,
        recipientDisplayName: null
      })

      if (prompt.deliveredAt) {
        events.push({
          id: `auto-play-prompt:${prompt.id}:delivered`,
          playIntentId: intent.id,
          occurredAt: prompt.deliveredAt.toISOString(),
          source: 'auto-play-prompt',
          eventType: 'prompt-delivered',
          summary: 'Auto-play prompt DM delivered',
          details: null,
          isError: false,
          notificationId: null,
          promptId: prompt.id,
          actorDisplayName: prompt.user.displayName,
          recipientDisplayName: prompt.user.displayName
        })
      }

      if (prompt.respondedAt) {
        events.push({
          id: `auto-play-prompt:${prompt.id}:responded`,
          playIntentId: intent.id,
          occurredAt: prompt.respondedAt.toISOString(),
          source: 'auto-play-prompt',
          eventType: 'prompt-responded',
          summary: `Auto-play prompt ${toClientPromptStatus(prompt.status)}`,
          details: prompt.statusDetail,
          isError: prompt.status === DiscordAutoPlayPromptStatus.FAILED || Boolean(prompt.dmError),
          notificationId: null,
          promptId: prompt.id,
          actorDisplayName: prompt.user.displayName,
          recipientDisplayName: prompt.user.displayName
        })
      }
    }

    for (const notification of intent.notifications) {
      events.push({
        id: `notification:${notification.id}:created`,
        playIntentId: intent.id,
        occurredAt: notification.createdAt.toISOString(),
        source: 'notification',
        eventType: 'notification-created',
        summary: `${toNotificationTypeLabel(notification.type)} created`,
        details: notification.title,
        isError: false,
        notificationId: notification.id,
        promptId: null,
        actorDisplayName: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null,
        recipientDisplayName: notification.user.displayName
      })

      if (notification.deliveredAt) {
        events.push({
          id: `notification:${notification.id}:delivered`,
          playIntentId: intent.id,
          occurredAt: notification.deliveredAt.toISOString(),
          source: 'notification',
          eventType: 'notification-delivered',
          summary: 'Notification DM delivered',
          details: notification.body,
          isError: false,
          notificationId: notification.id,
          promptId: null,
          actorDisplayName: null,
          recipientDisplayName: notification.user.displayName
        })
      }

      if (notification.respondedAt) {
        const responseLabel = notification.responseChoice ? notification.responseChoice.toLowerCase() : 'handled'
        events.push({
          id: `notification:${notification.id}:responded`,
          playIntentId: intent.id,
          occurredAt: notification.respondedAt.toISOString(),
          source: 'notification',
          eventType: 'notification-responded',
          summary: `Notification response recorded: ${responseLabel}`,
          details: null,
          isError: false,
          notificationId: notification.id,
          promptId: null,
          actorDisplayName: notification.user.displayName,
          recipientDisplayName: notification.user.displayName
        })
      }
    }

    if (intent.expiresAt.getTime() <= now.getTime()) {
      events.push({
        id: `play-intent:${intent.id}:ended`,
        playIntentId: intent.id,
        occurredAt: intent.expiresAt.toISOString(),
        source: 'play-intent',
        eventType: 'ended',
        summary: 'Call to play ended',
        details: `${intent.user.displayName}'s call to play ended.`,
        isError: false,
        notificationId: null,
        promptId: null,
        actorDisplayName: intent.user.displayName,
        recipientDisplayName: null
      })
    }

    events.sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    return events
  })

  const recentErrors = [
    ...(getDiscordPresenceBotState().lastError
      ? [{
          id: 'bot:last-error',
          occurredAt: new Date().toISOString(),
          source: 'system' as const,
          message: 'Discord bot reported an error',
          detail: getDiscordPresenceBotState().lastError,
          playIntentId: null,
          notificationId: null,
          promptId: null
        }]
      : []),
    ...recentAutoPlayPrompts
      .filter((prompt) => prompt.dmError || prompt.status === DiscordAutoPlayPromptStatus.FAILED)
      .map((prompt) => ({
        id: `auto-play-prompt:error:${prompt.id}`,
        occurredAt: (prompt.respondedAt ?? prompt.deliveredAt ?? prompt.createdAt).toISOString(),
        source: 'auto-play-prompt' as const,
        message: prompt.dmError ? 'Auto-play prompt DM error' : 'Auto-play prompt failed',
        detail: prompt.dmError ?? prompt.statusDetail ?? null,
        playIntentId: prompt.createdPlayIntentId ?? null,
        notificationId: null,
        promptId: prompt.id
      }))
  ]

  const recentPlayIntentRows = await Promise.all(recentPlayIntents.map(async (intent) => {
    const notificationCount = intent.notifications.length
    const deliveredNotificationCount = intent.notifications.filter((notification) => Boolean(notification.deliveredAt)).length
    const respondedNotificationCount = intent.notifications.filter((notification) => Boolean(notification.respondedAt)).length
    const errorCount = recentErrors.filter((errorEntry) => errorEntry.playIntentId === intent.id).length
    const creatorSummaryRevisions = buildCreatorSummaryRevisions({
      ...intent,
      user: {
        displayName: intent.user.displayName,
        timezoneId: intent.user.timezoneId
      },
      notifications: intent.notifications.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        deliveredAt: notification.deliveredAt,
        createdAt: notification.createdAt
      }))
    }, now)
    const creatorPreview = getLatestRevisionPreview(creatorSummaryRevisions)
    const previewIntent = previewPlayIntentMap.get(intent.id)
    const creatorDiscordUserId = previewIntent?.user.identities[0]?.providerUserId ?? null
    const creatorServerIds = creatorServerIdsByUserId.get(intent.user.id)
    const creatorMessages: Array<{
      id: string;
      kind: 'creator-summary' | 'scheduled-check-in';
      label: string;
      sentAt: string;
      deliveryState: 'emulated' | 'stored-only' | 'dm-delivered';
      preview: ReturnType<typeof buildDebugDmPreview>;
      revisions: ReturnType<typeof finalizeDmRevisions>;
    }> = [
      {
        id: `creator-summary:${intent.id}`,
        kind: 'creator-summary' as const,
        label: 'CTP summary',
        sentAt: creatorSummaryRevisions[0]?.occurredAt ?? intent.createdAt.toISOString(),
        deliveryState: toDebugDmDeliveryState(null, true),
        preview: creatorPreview ?? buildDebugDmPreview('', [] as never),
        revisions: creatorSummaryRevisions
      }
    ]

    const latestCheckInNotification = intent.notifications
      .filter((notification) => notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]

    if (latestCheckInNotification) {
      const revisions = buildNotificationMessageRevisions({
        messageId: `notification:${latestCheckInNotification.id}`,
        notification: latestCheckInNotification,
        creatorUserId: intent.user.id,
        creatorDiscordUserId,
        creatorDisplayName: intent.user.displayName,
        gameTitle: null,
        voiceChannel: null
      })

      creatorMessages.push({
        id: `notification:${latestCheckInNotification.id}`,
        kind: 'scheduled-check-in',
        label: 'Scheduled check-in',
        sentAt: latestCheckInNotification.createdAt.toISOString(),
        deliveryState: toDebugDmDeliveryState(latestCheckInNotification.deliveredAt, areDiscordDirectMessagesEmulated()),
        preview: getLatestRevisionPreview(revisions),
        revisions
      })
    }

    const audienceNotificationsByUserId = new Map<string, typeof intent.notifications>()

    for (const notification of intent.notifications) {
      if (
        notification.type !== NotificationType.FRIEND_PLAYING
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      ) {
        continue
      }

      const existingNotifications = audienceNotificationsByUserId.get(notification.userId) ?? []
      existingNotifications.push(notification)
      audienceNotificationsByUserId.set(notification.userId, existingNotifications)
    }

    const overlappingGameIds = intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
      ? creatorLibraryGameIdsByUserId.get(intent.user.id) ?? []
      : intent.games.map((entry) => entry.game.id)
    const includeSelf = intent.notifications.some((notification) => (
      notification.userId === intent.user.id
      && (
        notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      )
    ))
    const expectedAudienceScope = toClientNotifyScope(intent.scope) ?? 'friends-only'
    const expectedAudienceUserIds = await getPlayIntentRecipientUserIdsForDebug({
      userId: intent.user.id,
      scope: expectedAudienceScope,
      overlappingGameIds,
      targetUserIds: intent.targetFriends.map((entry) => entry.friendUser.id),
      includeSelf,
      targetDiscordServerId: intent.targetDiscordServer?.id ?? null
    })

    const audienceParticipants = [...audienceNotificationsByUserId.entries()].map(([recipientUserId, notifications]) => {
      const recipient = notifications[0]?.user
      const recipientServerIds = recipientServerIdsByUserId.get(recipientUserId)
      const recipientSharesServer = creatorServerIds != null && recipientServerIds != null
        ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
        : false
      const messages = notifications
        .map((notification) => {
          const revisions = buildNotificationMessageRevisions({
            messageId: `notification:${notification.id}`,
            notification,
            creatorUserId: intent.user.id,
            creatorDiscordUserId,
            creatorDisplayName: intent.user.displayName,
            gameTitle: notification.game?.title ?? null,
            voiceChannel: previewIntent && (previewIntent.voiceChannelId || previewIntent.voiceChannelName)
              ? {
                  channelId: previewIntent.voiceChannelId,
                  channelName: previewIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            joinCount: notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
              ? getInterestedCountBeforeNotification(
                  intent.notifications.map((entry) => ({
                    userId: entry.userId,
                    type: entry.type,
                    createdAt: entry.createdAt,
                    responseChoice: entry.responseChoice
                  })),
                  notification.createdAt
                )
              : undefined
          })

          return {
            id: `notification:${notification.id}`,
            kind: toInboxMessageKind(notification.type),
            label: toInboxMessageLabel(notification.type),
            sentAt: notification.createdAt.toISOString(),
            deliveryState: toDebugDmDeliveryState(notification.deliveredAt, areDiscordDirectMessagesEmulated()),
            preview: revisions[revisions.length - 1]?.preview,
            revisions
          }
        })
        .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())

      return recipient
        ? {
            user: {
              id: recipient.id,
              handle: recipient.handle,
              displayName: recipient.displayName,
              timezoneId: recipient.timezoneId
            },
            role: 'audience' as const,
            lastActivityAt: getLatestMessageActivityAt(messages),
            messages
          }
        : null
    }).filter((participant): participant is NonNullable<typeof participant> => participant != null)

    const existingAudienceUserIdSet = new Set(audienceParticipants.map((participant) => participant.user.id))
    const missingAudienceUserIds = expectedAudienceUserIds.filter((recipientUserId) => !existingAudienceUserIdSet.has(recipientUserId))
    const missingAudienceUsers = missingAudienceUserIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: missingAudienceUserIds
            }
          },
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        })
      : []
    const syntheticAudienceParticipants = missingAudienceUsers.map((recipient) => {
      const notificationCopy = buildPlayIntentNotificationCopy(
        intent.user.displayName,
        toClientSelectionMode(intent.selectionMode),
        intent.games.map((entry) => entry.game.title),
        Math.max(1, Math.round((intent.windowEndsAt.getTime() - intent.windowStartsAt.getTime()) / 60000)),
        intent.windowStartsAt,
        now,
        recipient.timezoneId
      )
      const syntheticPreview = {
        content: buildPlayIntentDirectMessage(
          notificationCopy.title,
          notificationCopy.body,
          creatorDiscordUserId,
          intent.user.displayName,
          previewIntent && (previewIntent.voiceChannelId || previewIntent.voiceChannelName)
            ? {
                channelId: previewIntent.voiceChannelId,
                channelName: previewIntent.voiceChannelName,
                recipientSharesServer: false
              }
            : null
        ),
        buttonRows: [
          [
            {
              label: "I'm interested",
              style: 'primary' as const,
              disabled: false,
              url: null,
              customId: buildDebugPlayIntentResponseCustomId(intent.id, 'join')
            },
            {
              label: 'Pass',
              style: 'secondary' as const,
              disabled: false,
              url: null,
              customId: buildDebugPlayIntentResponseCustomId(intent.id, 'pass')
            }
          ],
          [
            {
              label: 'Open in App',
              style: 'link' as const,
              disabled: false,
              url: new URL('/play', env.CLIENT_ORIGIN).toString(),
              customId: null
            }
          ]
        ]
      }

      return {
        user: {
          id: recipient.id,
          handle: recipient.handle,
          displayName: recipient.displayName,
          timezoneId: recipient.timezoneId
        },
        role: 'audience' as const,
        lastActivityAt: intent.createdAt.toISOString(),
        messages: [{
          id: `synthetic-notification:${intent.id}:${recipient.id}`,
          kind: 'call-to-play' as const,
          label: 'Call to play',
          sentAt: intent.createdAt.toISOString(),
          deliveryState: 'emulated' as const,
          preview: syntheticPreview,
          revisions: [{
            id: `synthetic-notification:${intent.id}:${recipient.id}:revision:1`,
            label: 'Latest state',
            occurredAt: intent.createdAt.toISOString(),
            preview: syntheticPreview
          }]
        }]
      }
    })

    const dmInboxParticipants = [
      {
        user: {
          id: intent.user.id,
          handle: intent.user.handle,
          displayName: intent.user.displayName,
          timezoneId: intent.user.timezoneId
        },
        role: 'creator' as const,
        lastActivityAt: getLatestMessageActivityAt(creatorMessages),
        messages: creatorMessages.sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())
      },
      ...[...audienceParticipants, ...syntheticAudienceParticipants].sort((left, right) => left.user.displayName.localeCompare(right.user.displayName))
    ]

    return {
      id: intent.id,
      createdAt: intent.createdAt.toISOString(),
      windowStartsAt: intent.windowStartsAt.toISOString(),
      windowEndsAt: intent.windowEndsAt.toISOString(),
      expiresAt: intent.expiresAt.toISOString(),
      status: intent.expiresAt.getTime() > now.getTime() ? 'active' : 'ended',
      headline: intent.headline,
      note: intent.note,
      selectionMode: toClientSelectionMode(intent.selectionMode),
      notifyScope: toClientNotifyScope(intent.scope),
      gameTitles: intent.games.map((entry) => entry.game.title).sort((left, right) => left.localeCompare(right)),
      platformLabels: intent.platforms.map((entry) => entry.platformLabel).sort((left, right) => left.localeCompare(right)),
      targetedFriendCount: intent.targetFriends.length,
      notificationCount,
      deliveredNotificationCount,
      respondedNotificationCount,
      errorCount,
      creator: {
        id: intent.user.id,
        handle: intent.user.handle,
        displayName: intent.user.displayName,
        timezoneId: intent.user.timezoneId
      },
      creatorDmPreview: creatorPreview ?? null,
      dmInboxParticipants
    }
  }))

  const recentAutoPlayPromptRows = recentAutoPlayPrompts.map((prompt) => {
    const previewPayload = buildDiscordAutoPlayPromptPreview({
      promptId: prompt.id,
      status: prompt.status,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      notifyScope: prompt.notifyScope,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      statusDetail: prompt.statusDetail,
      deliveredCount: prompt.createdPlayIntent?.notifications.length ?? 0
    })

    return {
      id: prompt.id,
      createdAt: prompt.createdAt.toISOString(),
      deliveredAt: prompt.deliveredAt?.toISOString() ?? null,
      respondedAt: prompt.respondedAt?.toISOString() ?? null,
      status: toClientPromptStatus(prompt.status),
      statusDetail: prompt.statusDetail,
      dmError: prompt.dmError,
      durationMinutes: prompt.durationMinutes,
      notifyScope: toClientNotifyScope(prompt.notifyScope ?? null),
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      sourceServerName: prompt.sourceServer?.name ?? null,
      observationStartedAt: prompt.observation.startedAt?.toISOString() ?? null,
      createdPlayIntentId: prompt.createdPlayIntentId,
      user: prompt.user,
      game: prompt.game,
      dmPreview: previewPayload ? buildDebugDmPreview(previewPayload.content, previewPayload.components) : null
    }
  })

  const recentNotificationRows = recentNotifications.map((notification) => {
    const playIntent = notification.playIntentId ? (previewPlayIntentMap.get(notification.playIntentId) ?? null) : null
    const creatorServerIds = playIntent ? creatorServerIdsByUserId.get(playIntent.userId) : null
    const recipientServerIds = recipientServerIdsByUserId.get(notification.user.id)
    const recipientSharesServer = creatorServerIds != null && recipientServerIds != null
      ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
      : false
    const previewPayload = buildNotificationDirectMessagePreview({
      notificationId: notification.id,
      notificationType: notification.type,
      title: notification.title,
      body: notification.body,
      responseChoice: notification.responseChoice,
      creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
      creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
      creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
      gameTitle: notification.game?.title ?? null,
      playIntentIsActive: playIntent ? playIntent.expiresAt.getTime() > now.getTime() : undefined,
      voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
        ? {
            channelId: playIntent.voiceChannelId,
            channelName: playIntent.voiceChannelName,
            recipientSharesServer
          }
        : null,
      joinCount: notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER && playIntent
        ? getInterestedCountBeforeNotification(playIntent.notifications, notification.createdAt)
        : undefined
    })

    return {
      id: notification.id,
      createdAt: notification.createdAt.toISOString(),
      deliveredAt: notification.deliveredAt?.toISOString() ?? null,
      title: notification.title,
      body: notification.body,
      gameTitle: notification.game?.title ?? null,
      recipient: notification.user,
      triggeredBy: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId) ?? null) : null,
      dmPreview: buildDebugDmPreview(previewPayload.content, previewPayload.components)
    }
  })

  return debugAdminResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    bot: getDiscordPresenceBotState(),
    recentAutoPlayPrompts: recentAutoPlayPromptRows,
    recentNotifications: recentNotificationRows,
    recentPlayIntents: recentPlayIntentRows,
    playIntentLifecycleEvents: lifecycleEvents,
    recentErrors
  })
}