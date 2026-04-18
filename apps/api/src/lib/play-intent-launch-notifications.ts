import {
  AuthProvider,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentSelectionMode,
  Prisma
} from '@prisma/client'
import { sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { prisma } from './prisma.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import { buildNotificationDirectMessagePreview } from './play-intent-notification-responses.js'

const creatorLaunchedGameNotificationTitle = 'Creator launched the game'
const interestedAudienceLaunchedGameNotificationTitle = 'Interested player launched the game'

const joinResponseNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

type LaunchObservation = {
  userId: string;
  gameId: string;
  game: {
    title: string;
  };
  user: {
    displayName: string;
    identities: Array<{
      providerUserId: string;
    }>;
  };
}

type CreatedSystemNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
}

async function lockLaunchNotification(
  transaction: Prisma.TransactionClient,
  key: string
) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

async function createSystemNotificationIfMissing(options: {
  recipientUserId: string;
  triggeredByUserId: string;
  playIntentId: string;
  gameId: string;
  title: string;
  body: string;
}) {
  return prisma.$transaction(async (transaction) => {
    await lockLaunchNotification(
      transaction,
      `play-intent-launch:${options.playIntentId}:${options.recipientUserId}:${options.triggeredByUserId}:${options.title}`
    )

    const existingNotification = await transaction.notification.findFirst({
      where: {
        userId: options.recipientUserId,
        triggeredByUserId: options.triggeredByUserId,
        playIntentId: options.playIntentId,
        type: NotificationType.SYSTEM,
        title: options.title
      },
      select: {
        id: true
      }
    })

    if (existingNotification) {
      return null
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
        userId: true,
        title: true,
        body: true
      }
    })
  })
}

async function deliverSystemNotifications(options: {
  notifications: CreatedSystemNotification[];
  recipientDiscordUserIdByUserId: Map<string, string>;
  actorDisplayName: string;
  actorDiscordUserId: string | null;
}) {
  const directMessageTargets = options.notifications.flatMap((notification) => {
    const discordUserId = options.recipientDiscordUserIdByUserId.get(notification.userId)

    if (!discordUserId) {
      return []
    }

    const preview = buildNotificationDirectMessagePreview({
      notificationId: notification.id,
      notificationType: NotificationType.SYSTEM,
      title: notification.title,
      body: notification.body,
      actorDisplayName: options.actorDisplayName,
      actorDiscordUserId: options.actorDiscordUserId
    })

    return [{
      notificationId: notification.id,
      discordUserId,
      content: preview.content,
      embeds: preview.embeds,
      components: preview.components
    }]
  })

  if (directMessageTargets.length === 0) {
    return
  }

  const results = await sendDiscordDirectMessages(directMessageTargets.map((target) => ({
    discordUserId: target.discordUserId,
    content: target.content,
    embeds: target.embeds,
    components: target.components
  })))

  const deliveredTargets = directMessageTargets.flatMap((target, index) => {
    const result = results[index]

    if (!result || result.status !== 'sent' || result.emulated) {
      return []
    }

    return [{
      notificationId: target.notificationId,
      channelId: result.channelId,
      messageId: result.messageId
    }]
  })

  if (deliveredTargets.length === 0) {
    return
  }

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

async function notifyAudienceWhenCreatorLaunches(observation: LaunchObservation) {
  const now = new Date()
  const activePlayIntents = await prisma.playIntent.findMany({
    where: {
      userId: observation.userId,
      expiresAt: {
        gt: now
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
      games: {
        select: {
          gameId: true
        }
      }
    }
  })

  const gameSpecificIntents = activePlayIntents.filter((playIntent) => (
    playIntent.games.length === 1 && playIntent.games[0]?.gameId === observation.gameId
  ))

  if (gameSpecificIntents.length === 0) {
    return
  }

  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId(gameSpecificIntents.map((playIntent) => playIntent.id))
  const recipientUserIds = [...new Set(gameSpecificIntents.flatMap((playIntent) => (
    (interestedUsersByPlayIntentId.get(playIntent.id) ?? [])
      .map((user) => user.id)
      .filter((userId) => userId !== observation.userId)
  )))]

  if (recipientUserIds.length === 0) {
    return
  }

  const createdNotifications = (await Promise.all(gameSpecificIntents.flatMap((playIntent) => (
    (interestedUsersByPlayIntentId.get(playIntent.id) ?? [])
      .filter((user) => user.id !== observation.userId)
      .map((user) => createSystemNotificationIfMissing({
        recipientUserId: user.id,
        triggeredByUserId: observation.userId,
        playIntentId: playIntent.id,
        gameId: observation.gameId,
        title: creatorLaunchedGameNotificationTitle,
        body: `${observation.user.displayName} just launched ${observation.game.title} for the active call to play you joined.`
      }))
  )))).filter((notification): notification is CreatedSystemNotification => notification != null)

  if (createdNotifications.length === 0) {
    return
  }

  const recipientIdentities = await prisma.userIdentity.findMany({
    where: {
      provider: AuthProvider.DISCORD,
      userId: {
        in: recipientUserIds
      }
    },
    select: {
      userId: true,
      providerUserId: true
    }
  })

  await deliverSystemNotifications({
    notifications: createdNotifications,
    recipientDiscordUserIdByUserId: new Map(recipientIdentities.map((identity) => [identity.userId, identity.providerUserId])),
    actorDisplayName: observation.user.displayName,
    actorDiscordUserId: observation.user.identities[0]?.providerUserId ?? null
  })
}

async function notifyCreatorsWhenInterestedAudienceLaunches(observation: LaunchObservation) {
  const now = new Date()
  const activePlayIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        not: observation.userId
      },
      expiresAt: {
        gt: now
      },
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      games: {
        some: {
          gameId: observation.gameId
        }
      },
      notifications: {
        some: {
          userId: observation.userId,
          responseChoice: NotificationResponseChoice.JOIN,
          type: {
            in: joinResponseNotificationTypes
          }
        }
      }
    },
    select: {
      id: true,
      userId: true,
      games: {
        select: {
          gameId: true
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

  const gameSpecificIntents = activePlayIntents.filter((playIntent) => (
    playIntent.games.length === 1 && playIntent.games[0]?.gameId === observation.gameId
  ))

  if (gameSpecificIntents.length === 0) {
    return
  }

  const createdNotifications = (await Promise.all(gameSpecificIntents.map((playIntent) => createSystemNotificationIfMissing({
    recipientUserId: playIntent.userId,
    triggeredByUserId: observation.userId,
    playIntentId: playIntent.id,
    gameId: observation.gameId,
    title: interestedAudienceLaunchedGameNotificationTitle,
    body: `${observation.user.displayName} just launched ${observation.game.title} for your active call to play.`
  })))).filter((notification): notification is CreatedSystemNotification => notification != null)

  if (createdNotifications.length === 0) {
    return
  }

  await deliverSystemNotifications({
    notifications: createdNotifications,
    recipientDiscordUserIdByUserId: new Map(gameSpecificIntents.flatMap((playIntent) => {
      const discordUserId = playIntent.user.identities[0]?.providerUserId

      return discordUserId
        ? [[playIntent.user.id, discordUserId] as const]
        : []
    })),
    actorDisplayName: observation.user.displayName,
    actorDiscordUserId: observation.user.identities[0]?.providerUserId ?? null
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

  const launchObservation: LaunchObservation = {
    userId: observation.userId,
    gameId: observation.gameId,
    game: observation.game,
    user: observation.user
  }

  await Promise.all([
    notifyAudienceWhenCreatorLaunches(launchObservation),
    notifyCreatorsWhenInterestedAudienceLaunches(launchObservation)
  ])
}
