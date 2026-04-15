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

const playIntentNotificationPrefix = 'play-intent-response'
const playIntentMutePrefix = 'play-intent-mute'
const scheduledPlayIntentCheckInPrefix = 'scheduled-play-intent-check-in'

type PlayIntentNotificationAction = {
  notificationId: string;
  response: NotificationResponseChoice;
}

type PlayIntentMuteAction = {
  creatorUserId: string;
}

type ScheduledPlayIntentCheckInAction = {
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

function buildMuteRow(creatorUserId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${playIntentMutePrefix}:${creatorUserId}`)
      .setLabel('Mute this player\'s CTPs')
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
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null
) {
  const voiceChannelLine = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `Voice channel: <#${voiceChannel.channelId}>`
      : `Voice channel: ${voiceChannel.channelName}`
    : null

  return [
    `**${title}**`,
    body,
    creatorDiscordUserId ? `Creator on Discord: <@${creatorDiscordUserId}>` : null,
    voiceChannelLine,
    supportsDiscordInteractiveMessages()
      ? 'Are you planning to join this call to play?'
      : 'Open Game\'s Up to answer this call to play.',
    supportsDiscordInteractiveMessages()
      ? "Use the buttons below to answer. You can still open Game's Up afterward and post your own call if you want to widen the group."
      : "You can still open Game's Up afterward and post your own call if you want to widen the group."
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildPlayIntentNotificationComponents(notificationId: string, creatorUserId?: string) {
  const rows = [buildResponseRow(notificationId)]
  if (creatorUserId) {
    rows.push(buildMuteRow(creatorUserId))
  }
  rows.push(buildLinkRow())
  return supportsDiscordInteractiveMessages() ? rows : [buildLinkRow()]
}

export function buildScheduledPlayIntentCheckInComponents(notificationId: string) {
  return supportsDiscordInteractiveMessages()
    ? [buildScheduledCheckInResponseRow(notificationId), buildLinkRow()]
    : [buildLinkRow()]
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

function buildCreatorCheckInPromptMessage(creatorDisplayName: string) {
  return [
    `Your scheduled call to play is starting now, ${creatorDisplayName}.`,
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
    body: `${creatorDisplayName} confirmed this call to play is still on. Are you joining?`
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

function buildCreatorDeclineNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  const title = notification.gameTitle
    ? `${notification.recipientDisplayName} is out for ${notification.gameTitle}`
    : `${notification.recipientDisplayName} is no longer joining`
  const body = notification.gameTitle
    ? `${notification.recipientDisplayName} changed their mind and is no longer joining your ${notification.gameTitle} call to play.`
    : `${notification.recipientDisplayName} changed their mind and is no longer joining your call to play.`

  return {
    title,
    body,
    dm: `**${title}**\n${body}\n\nOpen Game's Up: ${buildPlayUrl()}`
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
    const promptCopy = buildCreatorCheckInPromptMessage(intent.user.displayName)
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

    const dmResult = (await sendDiscordDirectMessages([
      {
        discordUserId: creatorIdentity.providerUserId,
        content: promptCopy,
        components: buildScheduledPlayIntentCheckInComponents(checkInNotification.id)
      }
    ]))[0]

    if (dmResult?.status === 'sent') {
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
        in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER]
      },
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
      createdNotifications: [...confirmedNotifications, ...reminderNotifications]
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
        content: buildPlayIntentDirectMessage(createdNotification.title, createdNotification.body, creatorDiscordUserId),
        components: createdNotification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
          ? buildPlayIntentNotificationComponents(createdNotification.id, playIntent.userId)
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

        return sentResult
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

  if (!notification.playIntentId || !notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('The original call to play is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  const playIntent = notification.playIntent
  const previousChoice = notification.responseChoice

  const creatorIdentity = await prisma.userIdentity.findFirst({
    where: {
      userId: playIntent.user.id,
      provider: AuthProvider.DISCORD
    },
    select: {
      providerUserId: true
    }
  })

  if (action.response === NotificationResponseChoice.DECLINE) {
    const creatorNotificationCopy = buildCreatorDeclineNotification({
      recipientDisplayName: notification.user.displayName,
      gameTitle: notification.game?.title ?? null
    })

    const creatorNotification = previousChoice === NotificationResponseChoice.JOIN
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
            responseChoice: NotificationResponseChoice.DECLINE
          },
          select: {
            id: true
          }
        })

    if (previousChoice === NotificationResponseChoice.JOIN && creatorIdentity?.providerUserId) {
      const dmResult = (await sendDiscordDirectMessages([
        {
          discordUserId: creatorIdentity.providerUserId,
          content: creatorNotificationCopy.dm
        }
      ]))[0]

      if (dmResult?.status === 'sent') {
        await prisma.notification.update({
          where: {
            id: creatorNotification.id
          },
          data: {
            deliveredAt: new Date()
          }
        })
      }
    }

    await interaction.update({
      content: previousChoice === NotificationResponseChoice.JOIN
        ? `Understood. I marked you as not joining ${playIntent.user.displayName}'s call to play and let them know.`
        : previousChoice === NotificationResponseChoice.DECLINE
          ? 'You are still marked as not joining this call to play.'
          : buildDeclineAcceptedMessage(),
      components: [buildLinkRow()]
    })
    return
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

  if (previousChoice !== NotificationResponseChoice.JOIN && creatorIdentity?.providerUserId) {
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
    content: previousChoice === NotificationResponseChoice.DECLINE
      ? `Nice. I marked you as joining ${playIntent.user.displayName}'s call to play and let them know.`
      : previousChoice === NotificationResponseChoice.JOIN
        ? 'You are still marked as joining this call to play.'
        : buildJoinAcceptedMessage(playIntent.user.displayName),
    components: [buildLinkRow()]
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
      id: true
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
    content: `Muted ${creatorUser.displayName}'s CTPs. You won't see their calls to play in your feed.`,
    components: [buildLinkRow()]
  })
}