import { debugAdminResponseSchema } from '@game-is-up/shared'
import {
  DiscordAutoPlayPromptStatus,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode
} from '@prisma/client'
import { getDiscordPresenceBotState } from './discord-bot-runtime.js'
import { prisma } from './prisma.js'

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
        games: {
          select: {
            game: {
              select: {
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
            id: true
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
  const autoPromptIdsByPlayIntentId = new Map<string, string[]>()

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

  const recentPlayIntentRows = recentPlayIntents.map((intent) => {
    const notificationCount = intent.notifications.length
    const deliveredNotificationCount = intent.notifications.filter((notification) => Boolean(notification.deliveredAt)).length
    const respondedNotificationCount = intent.notifications.filter((notification) => Boolean(notification.respondedAt)).length
    const errorCount = recentErrors.filter((errorEntry) => errorEntry.playIntentId === intent.id).length

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
      }
    }
  })

  return debugAdminResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    bot: getDiscordPresenceBotState(),
    recentAutoPlayPrompts: recentAutoPlayPrompts.map((prompt) => ({
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
      game: prompt.game
    })),
    recentNotifications: recentNotifications.map((notification) => ({
      id: notification.id,
      createdAt: notification.createdAt.toISOString(),
      deliveredAt: notification.deliveredAt?.toISOString() ?? null,
      title: notification.title,
      body: notification.body,
      gameTitle: notification.game?.title ?? null,
      recipient: notification.user,
      triggeredBy: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId) ?? null) : null
    })),
    recentPlayIntents: recentPlayIntentRows,
    playIntentLifecycleEvents: lifecycleEvents,
    recentErrors
  })
}