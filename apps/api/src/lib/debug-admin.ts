/**
 * Builds the admin-only debug snapshot consumed by `/api/debug/admin`.
 *
 * Aggregates bot state, recent play intents, lifecycle events, notification
 * delivery records, auto-play prompts, recent errors, and serialized DM
 * previews into a single read-only response. The DM previews are produced by
 * the same payload builders the live bot uses, so the web debug view inspects
 * actual current output rather than a separate emulator surface.
 */

import { getAutoPlayComposerDebugPreview } from './discord-auto-play-composer.js'
import { getPendingDiscordActionPreview } from './discord-action-state.js'
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
import { buildDebugDmPreview } from './discord-dm-preview.js'
import { getDiscordPresenceBotState } from './discord-bot-runtime.js'
import { getPlayIntentDiscordSpaceRecipientContexts } from './play-intent-discord-spaces.js'
import {
  buildPlayIntentNotificationPromptPreview,
  buildCreatorPlayIntentSummaryPreview,
  buildNotificationDirectMessagePreview,
  buildScheduledCheckInPromptPreview
} from './play-intent-notification-responses.js'
import { callToPlayEndedSystemNotification } from './play-intent-system-notifications.js'
import {
  buildPlayIntentUpdatesLogEntry,
  getPendingResponsePlayIntentPairKeys,
  type PlayIntentUpdatesLogEntry
} from './play-intent-updates-log.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { prisma } from './prisma.js'

type DebugDmPreviewPayload = ReturnType<typeof buildDebugDmPreview>

type DebugDmRevisionDraft = {
  occurredAt: string;
  preview: DebugDmPreviewPayload;
}

function areDebugDmPreviewsEqual(left: DebugDmPreviewPayload, right: DebugDmPreviewPayload) {
  return left.content === right.content
    && JSON.stringify(left.embeds) === JSON.stringify(right.embeds)
    && JSON.stringify(left.buttonRows) === JSON.stringify(right.buttonRows)
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
    runningLateAt?: Date | null;
    runningLateMinutes?: number | null;
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
      runningLateAt: notification.runningLateAt && notification.runningLateAt.getTime() <= currentTime.getTime()
        ? notification.runningLateAt
        : null,
      runningLateMinutes: notification.runningLateAt && notification.runningLateAt <= currentTime
        ? notification.runningLateMinutes ?? null
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
    displayName: string;
    timezoneId: string;
  };
  targetDiscordServers: Array<{
    server: {
      name: string;
    };
  }>;
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
    runningLateAt?: Date | null;
    runningLateMinutes?: number | null;
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
          discordSpace: intent.discordSpace,
          user: intent.user,
          targetDiscordServers: intent.targetDiscordServers,
          targetFriends: intent.targetFriends,
          games: intent.games,
          notifications: toCreatorSummaryNotificationsAtTime(intent.notifications, currentTime),
          currentTime
        })

        return {
          occurredAt: currentTime.toISOString(),
          preview: buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds)
        }
      })
  )
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
    case PlayIntentScope.SPECIFIC_FRIENDS_LIST:
      return 'friends-list'
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
      (
        notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      )
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

export async function buildDebugAdminSnapshot() {
  const now = new Date()
  const [recentAutoPlayPrompts, recentInviteAttributions, recentNotifications, recentPlayIntents] = await Promise.all([
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
    prisma.discordInviteAttribution.findMany({
      orderBy: {
        acceptedAt: 'desc'
      },
      take: 50,
      include: {
        acceptedUser: {
          select: {
            id: true,
            handle: true,
            displayName: true
          }
        },
        inviterUser: {
          select: {
            id: true,
            handle: true,
            displayName: true
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
        discordDmMessageId: true,
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
        targetDiscordServers: {
          include: {
            server: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
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
            runningLateAt: true,
            runningLateMinutes: true,
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
        },
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
                  id: true,
                  name: true
                }
              }
            }
          },
          targetFriends: {
            select: {
              friendUser: {
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
  const triggeredByUserMap = new Map(triggeredByUsers.map((user) => [user.id, user]))
  const previewPlayIntentMap = new Map(previewPlayIntents.map((intent) => [intent.id, intent]))
  const recentNotificationDiscordSpaceRecipientContextsByPlayIntentId = new Map(
    await Promise.all(
      previewPlayIntents.map(async (intent) => {
        const recentNotificationRecipientUserIds = recentNotifications
          .filter((notification) => notification.playIntentId === intent.id)
          .map((notification) => notification.user.id)

        return [
          intent.id,
          await getPlayIntentDiscordSpaceRecipientContexts(intent.id, recentNotificationRecipientUserIds)
        ] as const
      })
    )
  )
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
      discordSpace: intent.discordSpace
        ? {
            status: intent.discordSpace.status,
            textChannelName: intent.discordSpace.textChannelName,
            textChannelUrl: buildDiscordChannelUrl(intent.discordSpace.serverId, intent.discordSpace.textChannelId),
            voiceChannelName: intent.discordSpace.voiceChannelName,
            voiceChannelUrl: buildDiscordChannelUrl(intent.discordSpace.serverId, intent.discordSpace.voiceChannelId),
            inviteUrl: intent.discordSpace.inviteUrl,
            deleteAfter: intent.discordSpace.deleteAfter
          }
        : null,
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
    const creatorPreview = getPendingDiscordActionPreview(intent.creatorDiscordDmMessageId) ?? getLatestRevisionPreview(creatorSummaryRevisions)

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
      creatorSummaryPreview: creatorPreview
    }
  }))

  const creatorSummaryPreviewByPlayIntentId = new Map(
    recentPlayIntentRows.flatMap((intent) => intent.creatorSummaryPreview ? [[intent.id, intent.creatorSummaryPreview]] : [])
  )

  const recentAutoPlayPromptRows = await Promise.all(recentAutoPlayPrompts.map(async (prompt) => {
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
    const dmPreview = prompt.status === DiscordAutoPlayPromptStatus.ACCEPTED && prompt.createdPlayIntentId
      ? creatorSummaryPreviewByPlayIntentId.get(prompt.createdPlayIntentId)
        ?? (previewPayload ? buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds, prompt.discordDmMessageId) : null)
      : (prompt.status === DiscordAutoPlayPromptStatus.SENT ? await getAutoPlayComposerDebugPreview(prompt.id) : null) ?? (previewPayload
        ? buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds, prompt.discordDmMessageId)
        : null)

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
      dmPreview
    }
  }))

  // SYSTEM notification DMs are a single per-recipient updates log, so the
  // preview needs every sibling SYSTEM entry for the same (playIntent,
  // recipient) pair, not just this row's title/body.
  const systemLogNotifications = recentNotifications.filter((notification) => (
    notification.type === NotificationType.SYSTEM
    && notification.playIntentId
    && notification.title !== callToPlayEndedSystemNotification.title
  ))
  const systemLogPairKeys = new Set(
    systemLogNotifications.map((notification) => `${notification.playIntentId}:${notification.user.id}`)
  )
  const systemLogEntriesByPairKey = new Map<string, PlayIntentUpdatesLogEntry[]>()
  let systemLogPendingResponsePairKeys = new Set<string>()

  if (systemLogPairKeys.size > 0) {
    const systemLogPlayIntentIds = [...new Set(systemLogNotifications.map((notification) => notification.playIntentId as string))]
    const systemLogRecipientUserIds = [...new Set(systemLogNotifications.map((notification) => notification.user.id))]
    const [systemLogRows, systemLogRecipientTimezoneRows, pendingPairKeys] = await Promise.all([
      prisma.notification.findMany({
        where: {
          type: NotificationType.SYSTEM,
          title: {
            not: callToPlayEndedSystemNotification.title
          },
          playIntentId: {
            in: systemLogPlayIntentIds
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
            in: systemLogRecipientUserIds
          }
        },
        select: {
          id: true,
          timezoneId: true
        }
      }),
      getPendingResponsePlayIntentPairKeys(systemLogPlayIntentIds, systemLogRecipientUserIds)
    ])

    systemLogPendingResponsePairKeys = pendingPairKeys
    const timezoneIdByUserId = new Map(systemLogRecipientTimezoneRows.map((row) => [row.id, row.timezoneId]))

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

  const recentNotificationRows = recentNotifications.map((notification) => {
    const playIntent = notification.playIntentId ? (previewPlayIntentMap.get(notification.playIntentId) ?? null) : null
    const discordSpaceRecipientContext = notification.playIntentId
      ? recentNotificationDiscordSpaceRecipientContextsByPlayIntentId.get(notification.playIntentId)?.get(notification.user.id) ?? null
      : null
    const creatorServerIds = playIntent ? creatorServerIdsByUserId.get(playIntent.userId) : null
    const recipientServerIds = recipientServerIdsByUserId.get(notification.user.id)
    const recipientSharesServer = creatorServerIds != null && recipientServerIds != null
      ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
      : false
    const previewPayload = notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      ? buildScheduledCheckInPromptPreview({
          notificationId: notification.id,
          creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
          creatorDisplayName: playIntent?.user.displayName ?? null,
          resolved: Boolean(notification.responseChoice)
        })
      : notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ? notification.responseChoice === NotificationResponseChoice.EXPIRED
          ? buildNotificationDirectMessagePreview({
              notificationId: notification.id,
              notificationType: notification.type,
              title: notification.title,
              body: notification.body,
              responseChoice: notification.responseChoice,
              creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
              creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
              creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
              gameTitle: notification.game?.title ?? null,
              playIntentIsActive: false,
              voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
                ? {
                    channelId: playIntent.voiceChannelId,
                    channelName: playIntent.voiceChannelName,
                    recipientSharesServer
                  }
                : null,
              discordSpace: discordSpaceRecipientContext,
              interestedCount: (
                notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
                || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
              ) && playIntent
                ? getInterestedCountBeforeNotification(playIntent.notifications, notification.createdAt)
                : undefined,
              intentDetails: playIntent
                ? {
                    headline: playIntent.headline,
                    selectionMode: playIntent.selectionMode,
                    selectedGameTitles: playIntent.games.map((entry) => entry.game.title),
                    scope: playIntent.scope,
                    targetDiscordServers: playIntent.targetDiscordServers,
                    targetFriends: playIntent.targetFriends,
                    note: playIntent.note
                  }
                : undefined
            })
          : buildPlayIntentNotificationPromptPreview({
            notificationId: notification.id,
            notificationType: notification.type,
            title: notification.title,
            body: notification.body,
            responseChoice: notification.responseChoice,
            creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
            creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
            creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
            voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
              ? {
                  channelId: playIntent.voiceChannelId,
                  channelName: playIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            discordSpace: discordSpaceRecipientContext,
            interestedCount: (
              notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
              || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
            ) && playIntent
              ? getInterestedCountBeforeNotification(playIntent.notifications, notification.createdAt)
              : undefined,
            intentDetails: playIntent
              ? {
                  headline: playIntent.headline,
                  selectionMode: playIntent.selectionMode,
                  selectedGameTitles: playIntent.games.map((entry) => entry.game.title),
                  scope: playIntent.scope,
                  targetDiscordServers: playIntent.targetDiscordServers,
                  targetFriends: playIntent.targetFriends,
                  note: playIntent.note
                }
              : undefined
          })
        : buildNotificationDirectMessagePreview({
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
            discordSpace: discordSpaceRecipientContext,
            actorDisplayName: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null,
            actorDiscordUserId: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.identities[0]?.providerUserId ?? null) : null,
            intentDetails: playIntent
              ? {
                  headline: playIntent.headline,
                  selectionMode: playIntent.selectionMode,
                  selectedGameTitles: playIntent.games.map((entry) => entry.game.title),
                  scope: playIntent.scope,
                  targetDiscordServers: playIntent.targetDiscordServers,
                  targetFriends: playIntent.targetFriends,
                  note: playIntent.note
                }
              : undefined,
            systemLogEntries: notification.type === NotificationType.SYSTEM && notification.playIntentId
              ? systemLogEntriesByPairKey.get(`${notification.playIntentId}:${notification.user.id}`)
              : undefined,
            systemLogShowRespondCallToAction: notification.type === NotificationType.SYSTEM && notification.playIntentId
              ? systemLogPendingResponsePairKeys.has(`${notification.playIntentId}:${notification.user.id}`)
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
      dmPreview: buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds, notification.discordDmMessageId)
    }
  })

  const recentInviteAttributionRows = recentInviteAttributions.map((attribution) => ({
    id: attribution.id,
    acceptedAt: attribution.acceptedAt.toISOString(),
    kind: attribution.kind === 'DIRECT' ? 'direct' : 'server',
    serverId: attribution.serverId,
    serverName: attribution.serverName,
    memberCount: attribution.hintedMemberCount,
    acceptedUser: attribution.acceptedUser,
    inviterUser: attribution.inviterUser,
    inviterDiscordUserId: attribution.inviterDiscordUserId,
    inviterLabel: attribution.inviterLabel
  }))

  return debugAdminResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    bot: getDiscordPresenceBotState(),
    recentAutoPlayPrompts: recentAutoPlayPromptRows,
    recentInviteAttributions: recentInviteAttributionRows,
    recentNotifications: recentNotificationRows,
    recentPlayIntents: recentPlayIntentRows,
    playIntentLifecycleEvents: lifecycleEvents,
    recentErrors
  })
}