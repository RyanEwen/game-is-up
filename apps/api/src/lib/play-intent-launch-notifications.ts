/**
 * One-time live-activity nudges for active calls to play.
 *
 * When the presence stream observes someone in the live group launching the
 * planned game (or joining the associated voice channel), this module records
 * a SYSTEM notification per recipient and re-syncs each recipient's per-intent
 * updates-log DM so the activity lands as a new log entry (with a fresh push
 * notification). Audience-side nudges are gated to recipients who already
 * expressed interest, while creator-side nudges can still reflect audience
 * activity. Advisory locks prevent duplicate notifications when concurrent
 * presence events race for the same play intent + recipient pair.
 */

import {
  AuthProvider,
  NotificationType,
  PlayIntentSelectionMode,
  Prisma
} from '@prisma/client'
import { prisma } from './prisma.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  formatGroupLaunchedGameSystemNotification,
  formatVoiceChannelJoinedSystemNotification,
  type SystemNotificationCopy
} from './play-intent-system-notifications.js'
import { syncPlayIntentUpdatesLogDirectMessage } from './play-intent-updates-log.js'

const replyAnchorNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

type CreatedSystemNotification = {
  id: string;
  userId: string;
  playIntentId: string;
  title: string;
  body: string;
}

export function resolvePlayIntentActivityRecipientUserIds(options: {
  creatorUserId: string;
  triggeredByUserId: string;
  interestedUserIds: string[];
  audienceRecipientUserIds: string[];
}) {
  const audienceRecipientUserIds = [...new Set(options.audienceRecipientUserIds.filter(Boolean))]
  const interestedUserIds = new Set(options.interestedUserIds.filter(Boolean))
  const interestedAudienceRecipientUserIds = audienceRecipientUserIds.filter((userId) => interestedUserIds.has(userId))
  const actorIsCreator = options.creatorUserId === options.triggeredByUserId
  const actorIsAudienceRecipient = audienceRecipientUserIds.includes(options.triggeredByUserId)

  if (actorIsCreator) {
    return interestedAudienceRecipientUserIds.filter((userId) => userId !== options.triggeredByUserId)
  }

  if (!actorIsAudienceRecipient) {
    return []
  }

  return [
    options.creatorUserId,
    ...interestedAudienceRecipientUserIds.filter((userId) => userId !== options.triggeredByUserId)
  ]
}

export function buildPlayIntentActivityDeduplicationKey(options: {
  playIntentId: string;
  title: string;
  gameId?: string | null;
}) {
  return `play-intent-activity:${options.playIntentId}:${options.title}:${options.gameId ?? 'no-game'}`
}

async function lockLaunchNotification(
  transaction: Prisma.TransactionClient,
  key: string
) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

async function createSystemNotificationsIfMissing(options: {
  recipientUserIds: string[];
  triggeredByUserId: string;
  playIntentId: string;
  gameId?: string | null;
  title: string;
  body: string;
}) {
  const recipientUserIds = [...new Set(options.recipientUserIds.filter(Boolean))]

  if (recipientUserIds.length === 0) {
    return [] as CreatedSystemNotification[]
  }

  return prisma.$transaction(async (transaction) => {
    await lockLaunchNotification(
      transaction,
      buildPlayIntentActivityDeduplicationKey({
        playIntentId: options.playIntentId,
        title: options.title,
        gameId: options.gameId
      })
    )

    const existingNotification = await transaction.notification.findFirst({
      where: {
        playIntentId: options.playIntentId,
        gameId: options.gameId ?? null,
        type: NotificationType.SYSTEM,
        title: options.title
      },
      select: {
        id: true
      }
    })

    if (existingNotification) {
      return [] as CreatedSystemNotification[]
    }

    return Promise.all(recipientUserIds.map((recipientUserId) => transaction.notification.create({
      data: {
        userId: recipientUserId,
        triggeredByUserId: options.triggeredByUserId,
        playIntentId: options.playIntentId,
        gameId: options.gameId,
        type: NotificationType.SYSTEM,
        title: options.title,
        body: options.body
      },
      select: {
        id: true,
        userId: true,
        playIntentId: true,
        title: true,
        body: true
      }
    })))
  })
}

async function getAudienceRecipientUserIdsByPlayIntentId(playIntentIds: string[]) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  if (uniquePlayIntentIds.length === 0) {
    return new Map<string, string[]>()
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: uniquePlayIntentIds
      },
      type: {
        in: replyAnchorNotificationTypes
      }
    },
    select: {
      playIntentId: true,
      userId: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const recipientUserIdsByPlayIntentId = new Map<string, string[]>()

  for (const notification of notifications) {
    if (!notification.playIntentId) {
      continue
    }

    const recipientUserIds = recipientUserIdsByPlayIntentId.get(notification.playIntentId) ?? []

    if (!recipientUserIds.includes(notification.userId)) {
      recipientUserIds.push(notification.userId)
      recipientUserIdsByPlayIntentId.set(notification.playIntentId, recipientUserIds)
    }
  }

  return recipientUserIdsByPlayIntentId
}

async function deliverSystemNotifications(options: {
  notifications: CreatedSystemNotification[];
  recipientDiscordUserIdByUserId: Map<string, string>;
}) {
  // Each activity event lands as a new entry in the recipient's per-intent
  // updates-log DM, which is deleted and re-sent so Discord raises a fresh
  // push notification. Delivery timestamps are recorded by the log sync.
  await Promise.all(options.notifications.flatMap((notification) => {
    const discordUserId = options.recipientDiscordUserIdByUserId.get(notification.userId)

    if (!discordUserId) {
      return []
    }

    return [syncPlayIntentUpdatesLogDirectMessage({
      playIntentId: notification.playIntentId,
      recipientUserId: notification.userId,
      discordUserId
    })]
  }))
}
async function notifyRestOfGroupAboutActivity<Intent extends {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    identities: Array<{
      providerUserId: string;
    }>;
  };
}>(options: {
  playIntents: Intent[];
  triggeredByUserId: string;
  gameId?: string | null;
  buildNotificationCopy: (playIntent: Intent) => SystemNotificationCopy;
}) {
  if (options.playIntents.length === 0) {
    return
  }

  const [interestedUsersByPlayIntentId, audienceRecipientUserIdsByPlayIntentId] = await Promise.all([
    getInterestedUsersByPlayIntentId(options.playIntents.map((playIntent) => playIntent.id)),
    getAudienceRecipientUserIdsByPlayIntentId(options.playIntents.map((playIntent) => playIntent.id))
  ])
  const recipientUserIds = new Set<string>()
  const createdNotifications = (await Promise.all(options.playIntents.flatMap((playIntent) => {
    const interestedUserIds = (interestedUsersByPlayIntentId.get(playIntent.id) ?? []).map((user) => user.id)
    const audienceRecipientUserIds = audienceRecipientUserIdsByPlayIntentId.get(playIntent.id) ?? []

    const notificationCopy = options.buildNotificationCopy(playIntent)
    const playIntentRecipientUserIds = resolvePlayIntentActivityRecipientUserIds({
      creatorUserId: playIntent.userId,
      triggeredByUserId: options.triggeredByUserId,
      interestedUserIds,
      audienceRecipientUserIds
    })

    if (playIntentRecipientUserIds.length === 0) {
      return []
    }

    for (const recipientUserId of playIntentRecipientUserIds) {
      recipientUserIds.add(recipientUserId)
    }

    return createSystemNotificationsIfMissing({
      recipientUserIds: playIntentRecipientUserIds,
      triggeredByUserId: options.triggeredByUserId,
      playIntentId: playIntent.id,
      gameId: options.gameId,
      title: notificationCopy.title,
      body: notificationCopy.body
    })
  }))).flat().filter((notification): notification is CreatedSystemNotification => notification != null)

  if (createdNotifications.length === 0 || recipientUserIds.size === 0) {
    return
  }

  const recipientIdentities = await prisma.userIdentity.findMany({
    where: {
      provider: AuthProvider.DISCORD,
      userId: {
        in: [...recipientUserIds]
      }
    },
    select: {
      userId: true,
      providerUserId: true
    }
  })

  await deliverSystemNotifications({
    notifications: createdNotifications,
    recipientDiscordUserIdByUserId: new Map(recipientIdentities.map((identity) => [identity.userId, identity.providerUserId]))
  })
}

export async function maybeSendPlayIntentVoiceChannelJoinNotifications(options: {
  discordUserId: string;
  channelId: string;
  channelName?: string | null;
}) {
  const now = new Date()
  const actorIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: options.discordUserId
      }
    },
    select: {
      userId: true,
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

  if (!actorIdentity) {
    return
  }

  const activePlayIntents = await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        gt: now
      },
      windowStartsAt: {
        lte: now
      },
      OR: [
        {
          voiceChannelId: options.channelId
        },
        {
          discordSpace: {
            is: {
              voiceChannelId: options.channelId
            }
          }
        }
      ]
    },
    select: {
      id: true,
      userId: true,
      voiceChannelId: true,
      voiceChannelName: true,
      discordSpace: {
        select: {
          voiceChannelId: true,
          voiceChannelName: true
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
  })

  if (activePlayIntents.length === 0) {
    return
  }

  await notifyRestOfGroupAboutActivity({
    playIntents: activePlayIntents,
    triggeredByUserId: actorIdentity.userId,
    buildNotificationCopy: (playIntent) => formatVoiceChannelJoinedSystemNotification({
      actorDisplayName: actorIdentity.user.displayName,
      voiceChannelName: playIntent.voiceChannelId === options.channelId
        ? (playIntent.voiceChannelName ?? options.channelName)
        : (playIntent.discordSpace?.voiceChannelName ?? options.channelName)
    })
  })
}

export async function maybeSendPlayIntentLaunchNotificationsForObservation(observationId: string) {
  const observation = await prisma.discordActivityObservation.findUnique({
    where: {
      id: observationId
    },
    select: {
      userId: true,
      gameId: true,
      game: {
        select: {
          title: true
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

  if (!observation?.gameId || !observation.game) {
    return
  }

  const observedGame = observation.game

  const now = new Date()
  const activePlayIntents = await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        gt: now
      },
      windowStartsAt: {
        lte: now
      },
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      games: {
        some: {
          gameId: observation.gameId
        }
      }
    },
    select: {
      id: true,
      userId: true,
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
  })

  if (activePlayIntents.length === 0) {
    return
  }

  await notifyRestOfGroupAboutActivity({
    playIntents: activePlayIntents,
    triggeredByUserId: observation.userId,
    gameId: observation.gameId,
    buildNotificationCopy: () => formatGroupLaunchedGameSystemNotification({
      actorDisplayName: observation.user.displayName,
      gameTitle: observedGame.title
    })
  })
}
