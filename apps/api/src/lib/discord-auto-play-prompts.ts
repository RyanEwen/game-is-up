import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder
} from 'discord.js'
import {
  AuthProvider,
  DiscordAutoPlayPromptStatus,
  GameIntentType,
  PlayIntentScope,
  Prisma
} from '@prisma/client'
import { editDiscordDirectMessage, sendDiscordDirectMessages, supportsDiscordInteractiveMessages } from './discord-bot-runtime.js'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { getCurrentPlayIntent, getPlayIntentRecipientUserIds, upsertCurrentPlayIntent } from './play-intents.js'

const autoPlayPromptDurations = [60, 120, 240] as const
const autoPlayPromptCooldownMinutes = 10
const autoPlayPromptPrefix = 'auto-play'

type AutoPlayPromptAction =
  | { kind: 'duration'; promptId: string; durationMinutes: number }
  | { kind: 'confirm'; promptId: string; durationMinutes: number; notifyScope: 'friends-only' | 'network' }
  | { kind: 'decline'; promptId: string }

function buildPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function formatDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

function getAutoPlayPromptCooldownCutoff(referenceTime: Date) {
  return new Date(referenceTime.getTime() - (autoPlayPromptCooldownMinutes * 60 * 1000))
}

function buildLinkRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open in Game's Up")
      .setStyle(ButtonStyle.Link)
      .setURL(buildPlayUrl())
  )
}

function buildDurationRows(promptId: string) {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...autoPlayPromptDurations.map((durationMinutes) => new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:duration:${durationMinutes}`)
        .setLabel(durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`)
        .setStyle(ButtonStyle.Primary)),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:decline`)
        .setLabel('Not now')
        .setStyle(ButtonStyle.Secondary)
    ),
    buildLinkRow()
  ]
}

function buildAudienceRows(promptId: string, durationMinutes: number, friendRecipientCount: number, networkRecipientCount: number) {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:confirm:friends-only:${durationMinutes}`)
        .setLabel(`Friends only (${friendRecipientCount})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(friendRecipientCount === 0),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:confirm:network:${durationMinutes}`)
        .setLabel(`Your network + friends (${networkRecipientCount})`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:decline`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    ),
    buildLinkRow()
  ]
}

function buildInitialPromptMessage(gameTitle: string, networkRecipientCount: number) {
  return [
    `**You just started playing ${gameTitle}.**`,
    `${networkRecipientCount} people in your network and friends could receive a call to play for it right now.`,
    'Pick a duration and I will ask who should receive it. Open the app if you want the full composer instead.'
  ].join('\n\n')
}

function buildAudienceMessage(gameTitle: string, durationMinutes: number, friendRecipientCount: number, networkRecipientCount: number) {
  return [
    `**${gameTitle} for the next ${formatDurationLabel(durationMinutes)}**`,
    `Friends only can reach ${friendRecipientCount}. Your network plus friends can reach ${networkRecipientCount}.`,
    'Choose who should receive this call to play.'
  ].join('\n\n')
}

function buildDeclinedMessage(gameTitle: string) {
  return [
    `No problem. I will leave ${gameTitle} alone for now.`,
    "You can still open Game's Up any time to create a call to play manually."
  ].join('\n\n')
}

function buildExpiredMessage(reason: string) {
  return [
    'This prompt is no longer available.',
    reason,
    "Open Game's Up if you still want to create or edit a call to play."
  ].join('\n\n')
}

export async function expireDiscordAutoPlayPromptsForInactiveObservations(observationIds: string[]) {
  if (observationIds.length === 0) {
    return
  }

  const prompts = await prisma.discordAutoPlayPrompt.findMany({
    where: {
      observationId: {
        in: observationIds
      },
      status: DiscordAutoPlayPromptStatus.SENT,
      respondedAt: null
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  await Promise.all(prompts.map(async (prompt) => {
    const result = await prisma.discordAutoPlayPrompt.updateMany({
      where: {
        id: prompt.id,
        status: DiscordAutoPlayPromptStatus.SENT,
        respondedAt: null
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The observed Discord activity ended before the prompt was answered.'
      }
    })

    if (result.count === 0 || !prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      return
    }

    await editDiscordDirectMessage({
      channelId: prompt.discordDmChannelId,
      messageId: prompt.discordDmMessageId,
      content: buildExpiredMessage('That Discord activity ended before you answered.'),
      components: [buildLinkRow()]
    })
  }))
}

function buildAcceptedMessage(gameTitle: string, durationMinutes: number, notifyScope: 'friends-only' | 'network', deliveredCount: number) {
  return [
    `Your call to play for ${gameTitle} is live for the next ${formatDurationLabel(durationMinutes)}.`,
    notifyScope === 'friends-only'
      ? 'Audience: friends only.'
      : 'Audience: your network plus friends.',
    deliveredCount > 0
      ? `${deliveredCount} Discord DM${deliveredCount === 1 ? ' was' : 's were'} delivered right away.`
      : "No Discord DMs were delivered right away, but the call is active in Game's Up."
  ].join('\n\n')
}

function parseAction(customId: string): AutoPlayPromptAction | null {
  const parts = customId.split(':')
  const promptId = parts[1]

  if (parts[0] !== autoPlayPromptPrefix || !promptId) {
    return null
  }

  if (parts.length === 4 && parts[2] === 'duration') {
    const durationMinutes = Number(parts[3])

    return Number.isInteger(durationMinutes)
      ? { kind: 'duration', promptId, durationMinutes }
      : null
  }

  if (parts.length === 3 && parts[2] === 'decline') {
    return {
      kind: 'decline',
      promptId
    }
  }

  if (parts.length === 5 && parts[2] === 'confirm') {
    const durationMinutes = Number(parts[4])

    if (!Number.isInteger(durationMinutes) || (parts[3] !== 'friends-only' && parts[3] !== 'network' && parts[3] !== 'discovery-and-friends')) {
      return null
    }

    return {
      kind: 'confirm',
      promptId,
      notifyScope: parts[3] === 'discovery-and-friends' ? 'network' : parts[3],
      durationMinutes
    }
  }

  return null
}

async function createSkippedPrompt(options: {
  observationId: string;
  userId: string;
  gameId: string;
  sourceServerId: string | null;
  detail: string;
  friendRecipientCount?: number;
  networkRecipientCount?: number;
}) {
  await prisma.discordAutoPlayPrompt.create({
    data: {
      observationId: options.observationId,
      userId: options.userId,
      gameId: options.gameId,
      sourceServerId: options.sourceServerId,
      status: DiscordAutoPlayPromptStatus.SKIPPED,
      statusDetail: options.detail,
      friendRecipientCount: options.friendRecipientCount ?? 0,
      networkRecipientCount: options.networkRecipientCount ?? 0
    }
  })
}

async function createSkippedPromptInTransaction(
  transaction: Prisma.TransactionClient,
  options: {
    observationId: string;
    userId: string;
    gameId: string;
    sourceServerId: string | null;
    detail: string;
    friendRecipientCount?: number;
    networkRecipientCount?: number;
  }
) {
  await transaction.discordAutoPlayPrompt.create({
    data: {
      observationId: options.observationId,
      userId: options.userId,
      gameId: options.gameId,
      sourceServerId: options.sourceServerId,
      status: DiscordAutoPlayPromptStatus.SKIPPED,
      statusDetail: options.detail,
      friendRecipientCount: options.friendRecipientCount ?? 0,
      networkRecipientCount: options.networkRecipientCount ?? 0
    }
  })
}

async function lockAutoPlayPromptWindow(transaction: Prisma.TransactionClient, userId: string, gameId: string) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`discord-auto-play:${userId}:${gameId}`}))`
}

export async function maybeSendDiscordAutoPlayPromptForObservation(observationId: string) {
  const existingPrompt = await prisma.discordAutoPlayPrompt.findUnique({
    where: {
      observationId
    },
    select: {
      id: true
    }
  })

  if (existingPrompt) {
    return
  }

  const observation = await prisma.discordActivityObservation.findUnique({
    where: {
      id: observationId
    },
    select: {
      userId: true,
      gameId: true,
      sourceServerId: true,
      game: {
        select: {
          id: true,
          title: true
        }
      },
      user: {
        select: {
          id: true,
          discordAutoPromptPlayIntent: true
        }
      }
    }
  })

  if (!observation?.gameId || !observation.game) {
    return
  }

  if (!supportsDiscordInteractiveMessages()) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId: observation.gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because Discord auto-play prompts require the gateway-owning bot environment.'
    })
    return
  }

  const gameId = observation.gameId
  const gameTitle = observation.game.title

  if (!observation.user.discordAutoPromptPlayIntent) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because this user turned off automatic Discord prompts.'
    })
    return
  }

  const [activeIntent, libraryEntry, discordIdentity] = await Promise.all([
    prisma.playIntent.findFirst({
      where: {
        userId: observation.userId,
        expiresAt: {
          gt: new Date()
        }
      },
      select: {
        id: true
      }
    }),
    prisma.userGameInterest.findFirst({
      where: {
        userId: observation.userId,
        gameId: observation.gameId,
        intentType: {
          not: GameIntentType.COMPLETED
        }
      },
      select: {
        id: true,
        platforms: {
          select: {
            platformLabel: true
          }
        }
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        userId: observation.userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })
  ])

  if (activeIntent) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the user already has an active call to play.'
    })
    return
  }

  if (!libraryEntry || libraryEntry.platforms.length === 0) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the observed game is not in the user library with playable platforms.'
    })
    return
  }

  if (!discordIdentity?.providerUserId) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the user does not have a linked Discord identity.'
    })
    return
  }

  const [friendRecipients, networkRecipients] = await Promise.all([
    getPlayIntentRecipientUserIds(observation.userId, 'friends-only', [gameId]),
    getPlayIntentRecipientUserIds(observation.userId, 'network', [gameId])
  ])

  const prompt = await prisma.$transaction(async (transaction) => {
    await lockAutoPlayPromptWindow(transaction, observation.userId, gameId)

    const cooldownCutoff = getAutoPlayPromptCooldownCutoff(new Date())
    const recentPrompt = await transaction.discordAutoPlayPrompt.findFirst({
      where: {
        userId: observation.userId,
        gameId,
        createdAt: {
          gte: cooldownCutoff
        },
        OR: [
          {
            deliveredAt: {
              not: null
            }
          },
          {
            status: DiscordAutoPlayPromptStatus.SENT
          }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        createdAt: true
      }
    })

    if (recentPrompt) {
      await createSkippedPromptInTransaction(transaction, {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        detail: `Skipped because ${gameTitle} was already prompted within the last ${formatDurationLabel(autoPlayPromptCooldownMinutes)}.`
      })
      return null
    }

    if (networkRecipients.length === 0) {
      await createSkippedPromptInTransaction(transaction, {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        detail: 'Skipped because nobody in your network or friends currently overlaps on this game.',
        friendRecipientCount: friendRecipients.length,
        networkRecipientCount: networkRecipients.length
      })
      return null
    }

    return transaction.discordAutoPlayPrompt.create({
      data: {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        status: DiscordAutoPlayPromptStatus.SENT,
        statusDetail: `Prompt DM queued for ${gameTitle}.`,
        friendRecipientCount: friendRecipients.length,
        networkRecipientCount: networkRecipients.length
      },
      select: {
        id: true
      }
    })
  })

  if (!prompt) {
    return
  }

  const dmResult = (await sendDiscordDirectMessages([
    {
      discordUserId: discordIdentity.providerUserId,
      content: buildInitialPromptMessage(observation.game.title, networkRecipients.length),
      components: buildDurationRows(prompt.id)
    }
  ]))[0]

  if (!dmResult || dmResult.status === 'failed') {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.FAILED,
        statusDetail: 'Prompt DM could not be delivered.',
        dmError: dmResult?.error ?? 'Unknown Discord DM delivery failure.'
      }
    })
    return
  }

  await prisma.discordAutoPlayPrompt.update({
    where: {
      id: prompt.id
    },
    data: {
      deliveredAt: new Date(),
      statusDetail: `Prompt DM sent for ${observation.game.title}.`,
      discordDmChannelId: dmResult.channelId,
      discordDmMessageId: dmResult.messageId
    }
  })
}

export async function handleDiscordAutoPlayPromptInteraction(interaction: ButtonInteraction) {
  const action = parseAction(interaction.customId)

  if (!action) {
    return
  }

  const prompt = await prisma.discordAutoPlayPrompt.findUnique({
    where: {
      id: action.promptId
    },
    include: {
      user: {
        select: {
          id: true,
          discordAutoPromptPlayIntent: true
        }
      },
      game: {
        select: {
          id: true,
          title: true
        }
      },
      observation: {
        select: {
          isActive: true
        }
      }
    }
  })

  if (!prompt) {
    await interaction.update({
      content: buildExpiredMessage('The saved prompt record could not be found.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (prompt.status !== DiscordAutoPlayPromptStatus.SENT) {
    await interaction.update({
      content: buildExpiredMessage(prompt.statusDetail ?? 'It was already handled earlier.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (!prompt.user.discordAutoPromptPlayIntent) {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The user turned off automatic Discord prompts before responding.'
      }
    })
    await interaction.update({
      content: buildExpiredMessage('Automatic Discord prompts are turned off in your profile now.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (!prompt.observation.isActive) {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The observed Discord activity already ended before the prompt was answered.'
      }
    })
    await interaction.update({
      content: buildExpiredMessage('That Discord activity is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (action.kind === 'decline') {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.DECLINED,
        respondedAt: new Date(),
        statusDetail: 'The user declined the prompt from Discord.'
      }
    })
    await interaction.update({
      content: buildDeclinedMessage(prompt.game.title),
      components: [buildLinkRow()]
    })
    return
  }

  if (action.kind === 'duration') {
    await interaction.update({
      content: buildAudienceMessage(prompt.game.title, action.durationMinutes, prompt.friendRecipientCount, prompt.networkRecipientCount),
      components: buildAudienceRows(prompt.id, action.durationMinutes, prompt.friendRecipientCount, prompt.networkRecipientCount)
    })
    return
  }

  const selectedRecipientCount = action.notifyScope === 'friends-only'
    ? prompt.friendRecipientCount
    : prompt.networkRecipientCount

  if (selectedRecipientCount === 0) {
    await interaction.update({
      content: buildExpiredMessage('That audience no longer has anyone who overlaps on this game.'),
      components: [buildLinkRow()]
    })
    return
  }

  const activeIntent = await getCurrentPlayIntent(prompt.user.id)

  if (activeIntent) {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The user already had an active call to play before accepting this prompt.'
      }
    })
    await interaction.update({
      content: buildExpiredMessage('You already have an active call to play.'),
      components: [buildLinkRow()]
    })
    return
  }

  try {
    const response = await upsertCurrentPlayIntent(prompt.user.id, {
      selectionMode: 'subset',
      notifyScope: action.notifyScope,
      gameIds: [prompt.game.id],
      targetUserIds: [],
      durationMinutes: action.durationMinutes,
      note: ''
    })

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.ACCEPTED,
        respondedAt: new Date(),
        durationMinutes: action.durationMinutes,
        notifyScope: action.notifyScope === 'friends-only' ? PlayIntentScope.FRIENDS_ONLY : PlayIntentScope.MUTUAL_FRIENDS,
        createdPlayIntentId: response.activeIntent.id,
        statusDetail: `${response.notifiedFriendCount} Discord DM${response.notifiedFriendCount === 1 ? '' : 's'} delivered from this Discord-created call to play.`
      }
    })

    await interaction.update({
      content: buildAcceptedMessage(prompt.game.title, action.durationMinutes, action.notifyScope, response.notifiedFriendCount),
      components: [buildLinkRow()]
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create a call to play from Discord right now.'

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.FAILED,
        respondedAt: new Date(),
        durationMinutes: action.durationMinutes,
        notifyScope: action.notifyScope === 'friends-only' ? PlayIntentScope.FRIENDS_ONLY : PlayIntentScope.MUTUAL_FRIENDS,
        statusDetail: message,
        dmError: message
      }
    })

    await interaction.update({
      content: buildExpiredMessage(message),
      components: [buildLinkRow()]
    })
  }
}