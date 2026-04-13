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
import { editDiscordDirectMessage, sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { env } from './env.js'
import { prisma } from './prisma.js'

const playIntentNotificationPrefix = 'play-intent-response'

type PlayIntentNotificationAction = {
  notificationId: string;
  response: NotificationResponseChoice;
}

function buildPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function buildLinkRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open in Game's Up")
      .setStyle(ButtonStyle.Link)
      .setURL(buildPlayUrl())
  )
}

function buildResponseRow(notificationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:join`)
      .setLabel('I am in')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:decline`)
      .setLabel('Not this time')
      .setStyle(ButtonStyle.Secondary)
  )
}

export function buildPlayIntentDirectMessage(title: string, body: string) {
  return [
    `**${title}**`,
    body,
    'Are you planning to join this call to play?',
    "Use the buttons below to answer. You can still open Game's Up afterward and post your own call if you want to widen the group."
  ].join('\n\n')
}

export function buildPlayIntentNotificationComponents(notificationId: string) {
  return [buildResponseRow(notificationId), buildLinkRow()]
}

function buildExpiredMessage(reason: string) {
  return [
    'This call-to-play prompt is no longer available.',
    reason,
    "Open Game's Up if you still want to coordinate or post your own call to play."
  ].join('\n\n')
}

function buildJoinAcceptedMessage(creatorDisplayName: string) {
  return [
    `I recorded that you are joining ${creatorDisplayName}'s call to play.`,
    "If you want to widen the group, you can still open Game's Up and post your own call too."
  ].join('\n\n')
}

function buildDeclineAcceptedMessage() {
  return [
    'No problem. I will leave it there.',
    "If you change your mind later, open Game's Up to see any active calls to play."
  ].join('\n\n')
}

function buildSessionEndedReason(creatorDisplayName: string, gameTitle: string | null) {
  return gameTitle
    ? `${creatorDisplayName}'s ${gameTitle} session ended before you answered.`
    : `${creatorDisplayName}'s call to play ended before you answered.`
}

function buildAlreadyHandledMessage(responseChoice: NotificationResponseChoice | null) {
  if (responseChoice === NotificationResponseChoice.JOIN) {
    return buildExpiredMessage('You already said that you are joining this call to play.')
  }

  if (responseChoice === NotificationResponseChoice.DECLINE) {
    return buildExpiredMessage('You already said that you are not joining this call to play.')
  }

  if (responseChoice === NotificationResponseChoice.EXPIRED) {
    return buildExpiredMessage('That call to play ended before you answered.')
  }

  return buildExpiredMessage('It was already handled earlier.')
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

  return null
}

function buildCreatorJoinNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  const title = notification.gameTitle
    ? `${notification.recipientDisplayName} is in for ${notification.gameTitle}`
    : `${notification.recipientDisplayName} is joining your call to play`
  const body = notification.gameTitle
    ? `${notification.recipientDisplayName} said yes to your ${notification.gameTitle} call to play.`
    : `${notification.recipientDisplayName} said yes to your call to play.`

  return {
    title,
    body,
    dm: `**${title}**\n${body}\n\nOpen Game's Up: ${buildPlayUrl()}`
  }
}

export function isPlayIntentNotificationCustomId(customId: string) {
  return customId.startsWith(`${playIntentNotificationPrefix}:`)
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
      type: NotificationType.FRIEND_PLAYING,
      respondedAt: null
    },
    select: {
      id: true,
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
              displayName: true
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

    await editDiscordDirectMessage({
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      content: buildExpiredMessage(
        buildSessionEndedReason(notification.playIntent?.user.displayName ?? 'This player', notification.game?.title ?? null)
      ),
      components: [buildLinkRow()]
    })
  }))
}

export async function handlePlayIntentNotificationInteraction(interaction: ButtonInteraction) {
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
                displayName: true
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

  if (notification.respondedAt) {
    await interaction.update({
      content: buildAlreadyHandledMessage(notification.responseChoice),
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

  if (action.response === NotificationResponseChoice.DECLINE) {
    const declineResult = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.DECLINE
      }
    })

    await interaction.update({
      content: declineResult.count > 0
        ? buildDeclineAcceptedMessage()
        : buildAlreadyHandledMessage(NotificationResponseChoice.DECLINE),
      components: [buildLinkRow()]
    })
    return
  }

  const creatorNotificationCopy = buildCreatorJoinNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: notification.game?.title ?? null
  })

  const joinResult = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.JOIN
      }
    })

    if (updateResult.count === 0) {
      return null
    }

    const creatorNotification = await transaction.notification.create({
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

    return creatorNotification
  })

  if (!joinResult) {
    await interaction.update({
      content: buildAlreadyHandledMessage(NotificationResponseChoice.JOIN),
      components: [buildLinkRow()]
    })
    return
  }

  const creatorIdentity = await prisma.userIdentity.findFirst({
    where: {
      userId: playIntent.user.id,
      provider: AuthProvider.DISCORD
    },
    select: {
      providerUserId: true
    }
  })

  if (creatorIdentity?.providerUserId) {
    const dmResult = (await sendDiscordDirectMessages([
      {
        discordUserId: creatorIdentity.providerUserId,
        content: creatorNotificationCopy.dm
      }
    ]))[0]

    if (dmResult?.status === 'sent') {
      await prisma.notification.update({
        where: {
          id: joinResult.id
        },
        data: {
          deliveredAt: new Date()
        }
      })
    }
  }

  await interaction.update({
    content: buildJoinAcceptedMessage(playIntent.user.displayName),
    components: [buildLinkRow()]
  })
}