/**
 * Discord guild slash commands owned by the gateway-mode bot.
 *
 * Defines the command builders registered with Discord, plus the handlers for
 * server-adoption and discovery shortcuts (invite flows, member roster, list
 * of active calls to play visible to that server). Invite shortcuts route
 * through a dedicated web invite landing page that preserves server and
 * inviter context across Discord OAuth instead of falling into the generic
 * app shell.
 */

import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js'
import {
  AuthProvider,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode,
} from '@prisma/client'
import { buildDiscordServerIconUrl } from './discord-servers.js'
import { getDiscordBotRest } from './discord-bot-runtime.js'
import {
  handleSetupCtpPostCommand,
  launchCtpComposer,
} from './discord-ctp-composer.js'
import {
  buildDiscordInviteUrl,
  buildInviteButtonRow,
  buildInviteLandingUrl,
} from './discord-invite-links.js'
import { env } from './env.js'
import { toClientAvatarUrl, toClientGameCoverUrl } from './game-media.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'
import { logger } from './logger.js'

const slashCommands = [
  new SlashCommandBuilder()
    .setName('invite-user')
    .setDescription("DM a Game's Up invite to someone in this server.")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The Discord user to invite.')
        .setRequired(true),
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('invite-link')
    .setDescription("Post a shareable Game's Up invite link for this server.")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('app-members')
    .setDescription("List people from this server who already use Game's Up.")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('server-ctps')
    .setDescription('Show active calls to play from members of this server.')
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('post-ctp')
    .setDescription("Post a Game's Up call to play with the guided composer.")
    .setDMPermission(true),
  new SlashCommandBuilder()
    .setName('setup-ctp-post')
    .setDescription("Post or refresh the Game's Up hub in this channel.")
    .addBooleanOption((option) =>
      option
        .setName('lock-channel')
        .setDescription(
          'True keeps the hub visible by stopping member posts; false lifts an earlier lock.',
        )
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
].map((command) =>
  command.toJSON(),
) satisfies RESTPostAPIApplicationCommandsJSONBody[]

type ServerAppMember = {
  discordUserId: string
  appUserId: string
  appDisplayName: string
  appHandle: string
}

function summarizeGameTitles(
  selectionMode: PlayIntentSelectionMode,
  games: Array<{ game: { title: string; coverUrl: string | null } }>,
) {
  if (selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY) {
    return 'Any game in their library that is also in yours.'
  }

  const titles = games
    .map((entry) => entry.game.title)
    .sort((left, right) => left.localeCompare(right))

  if (titles.length <= 4) {
    return titles.join(', ')
  }

  return `${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function toInviteSenderLabel(interaction: ChatInputCommandInteraction) {
  return interaction.user.globalName?.trim() || interaction.user.username
}

function formatAppMemberLabel(member: ServerAppMember) {
  return `${member.appDisplayName} (@${member.appHandle})`
}

function formatAppMemberLines(appMembers: ServerAppMember[]) {
  const sortedMembers = [...appMembers].sort((left, right) =>
    left.appDisplayName.localeCompare(right.appDisplayName),
  )

  const visibleMembers = sortedMembers.slice(0, 20)
  const lines = visibleMembers.map(
    (member) => `- ${formatAppMemberLabel(member)}`,
  )

  if (sortedMembers.length > visibleMembers.length) {
    lines.push(`- +${sortedMembers.length - visibleMembers.length} more`)
  }

  return lines.join('\n')
}

async function buildServerAppMemberSnapshot(serverId: string) {
  const guildMembers = await prisma.discordServer.findUnique({
    where: {
      id: serverId,
    },
    select: {
      name: true,
      iconHash: true,
    },
  })

  const { listDiscordGuildMembers } = await import('./discord-presence-bot.js')
  const serverMembers = await listDiscordGuildMembers(serverId)
  const identities = await prisma.userIdentity.findMany({
    where: {
      provider: AuthProvider.DISCORD,
      providerUserId: {
        in: serverMembers.members.map((member) => member.id),
      },
    },
    select: {
      providerUserId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          handle: true,
        },
      },
    },
  })

  const appUserByDiscordId = new Map(
    identities.map((identity) => [identity.providerUserId, identity.user]),
  )
  const appMembers = serverMembers.members.flatMap((member) => {
    const appUser = appUserByDiscordId.get(member.id)

    return appUser
      ? [
          {
            discordUserId: member.id,
            appUserId: appUser.id,
            appDisplayName: appUser.displayName,
            appHandle: appUser.handle,
          },
        ]
      : []
  })

  return {
    serverId,
    serverName: serverMembers.serverName || guildMembers?.name || 'this server',
    serverIconUrl: toClientAvatarUrl(
      buildDiscordServerIconUrl(serverId, guildMembers?.iconHash ?? null),
    ),
    appMembers,
  }
}

async function resolveLinkedAppUser(discordUserId: string) {
  return prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: discordUserId,
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          displayName: true,
          handle: true,
        },
      },
    },
  })
}

async function handleInviteUserCommand(
  interaction: ChatInputCommandInteraction,
) {
  const serverId = interaction.guildId
  const targetUser = interaction.options.getUser('user', true)

  if (!serverId) {
    await interaction.reply({
      content: 'This command only works in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: "Bots cannot be invited to Game's Up.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content:
        'Use `/invite-link` if you want a shareable sign-in link for yourself or the channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const existingIdentity = await resolveLinkedAppUser(targetUser.id)

  if (existingIdentity) {
    await interaction.editReply({
      content: `${targetUser} is already on Game's Up as ${existingIdentity.user.displayName} (@${existingIdentity.user.handle}).`,
    })
    return
  }

  const { sendDiscordGuildInvites } = await import('./discord-presence-bot.js')
  const inviteResult = await sendDiscordGuildInvites({
    serverId,
    memberIds: [targetUser.id],
    inviterLabel: toInviteSenderLabel(interaction),
    inviterDiscordUserId: interaction.user.id,
    inviteUrl: buildDiscordInviteUrl(),
  })

  const result = inviteResult.results[0]

  if (!result || result.status !== 'sent') {
    await interaction.editReply({
      content:
        result?.error ?? `I couldn't DM ${targetUser} an invite right now.`,
    })
    return
  }

  await interaction.editReply({
    content: `Sent a Game's Up invite to ${targetUser}.`,
  })
}

async function handleInviteLinkCommand(
  interaction: ChatInputCommandInteraction,
) {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: 'This command only works in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const snapshot = await buildServerAppMemberSnapshot(serverId)
  const memberCount = snapshot.appMembers.length
  const inviteUrl = buildInviteLandingUrl({
    serverId,
    serverName: snapshot.serverName,
    inviterDiscordUserId: interaction.user.id,
    inviterLabel: toInviteSenderLabel(interaction),
    memberCount,
    kind: 'server',
  })
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(`Join Game's Up in ${snapshot.serverName}`)
    .setDescription(
      memberCount > 0
        ? `${memberCount} ${memberCount === 1 ? 'person from this server already uses' : 'people from this server already use'} Game's Up. Sign in with Discord to find friends and see calls to play.`
        : "Be the first person from this server to join Game's Up. Sign in with Discord to find friends and see calls to play.",
    )

  if (snapshot.serverIconUrl) {
    embed.setThumbnail(snapshot.serverIconUrl)
  }

  await interaction.reply({
    embeds: [embed],
    components: [buildInviteButtonRow(inviteUrl)],
  })
}

async function handleAppMembersCommand(
  interaction: ChatInputCommandInteraction,
) {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: 'This command only works in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const snapshot = await buildServerAppMemberSnapshot(serverId)

  if (snapshot.appMembers.length === 0) {
    await interaction.editReply({
      content: `Nobody from ${snapshot.serverName} has linked Game's Up yet.`,
    })
    return
  }

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`Game's Up members in ${snapshot.serverName}`)
    .setDescription(formatAppMemberLines(snapshot.appMembers))
    .setFooter({
      text: `${snapshot.appMembers.length} ${snapshot.appMembers.length === 1 ? 'member' : 'members'} found`,
    })

  if (snapshot.serverIconUrl) {
    embed.setThumbnail(snapshot.serverIconUrl)
  }

  await interaction.editReply({
    embeds: [embed],
    components: [
      buildInviteButtonRow(
        buildInviteLandingUrl({
          serverId,
          serverName: snapshot.serverName,
          inviterDiscordUserId: interaction.user.id,
          inviterLabel: toInviteSenderLabel(interaction),
          memberCount: snapshot.appMembers.length,
          kind: 'server',
        }),
      ),
    ],
  })
}

async function handleServerCtpsCommand(
  interaction: ChatInputCommandInteraction,
) {
  const serverId = interaction.guildId

  if (!serverId) {
    await interaction.reply({
      content: 'This command only works in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const snapshot = await buildServerAppMemberSnapshot(serverId)
  const appUserIds = snapshot.appMembers.map((member) => member.appUserId)

  if (appUserIds.length === 0) {
    await interaction.editReply({
      content: `Nobody from ${snapshot.serverName} is on Game's Up yet.`,
    })
    return
  }

  const playIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: appUserIds,
      },
      expiresAt: {
        gt: new Date(),
      },
      scope: {
        in: [
          PlayIntentScope.MUTUAL_FRIENDS,
          PlayIntentScope.SPECIFIC_DISCORD_SERVER,
        ],
      },
    },
    include: {
      user: {
        select: {
          displayName: true,
          handle: true,
          timezoneId: true,
          avatarUrl: true,
        },
      },
      games: {
        include: {
          game: {
            select: {
              title: true,
              coverUrl: true,
            },
          },
        },
      },
      platforms: {
        select: {
          platformLabel: true,
        },
      },
      targetDiscordServers: {
        select: {
          serverId: true,
          server: {
            select: {
              id: true,
              name: true,
              iconHash: true,
            },
          },
        },
      },
      _count: {
        select: {
          notifications: {
            where: {
              responseChoice: NotificationResponseChoice.JOIN,
              type: {
                in: [
                  NotificationType.FRIEND_PLAYING,
                  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
                  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
                ],
              },
            },
          },
        },
      },
    },
    orderBy: {
      windowStartsAt: 'asc',
    },
  })

  const visiblePlayIntents = playIntents.filter(
    (playIntent) =>
      playIntent.scope !== PlayIntentScope.SPECIFIC_DISCORD_SERVER ||
      playIntent.targetDiscordServers.some(
        (entry) => entry.serverId === serverId,
      ),
  )

  if (visiblePlayIntents.length === 0) {
    await interaction.editReply({
      content: `No active server-visible calls to play are posted from ${snapshot.serverName} right now.`,
    })
    return
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Active calls to play in ${snapshot.serverName}`)
    .setDescription(
      'Showing active network-wide or current-server-targeted calls to play.',
    )

  if (snapshot.serverIconUrl) {
    embed.setThumbnail(snapshot.serverIconUrl)
  }

  const limitedPlayIntents = visiblePlayIntents.slice(0, 8)

  for (const playIntent of limitedPlayIntents) {
    const gamesLabel = summarizeGameTitles(
      playIntent.selectionMode,
      playIntent.games,
    )
    const audienceLabel =
      playIntent.scope === PlayIntentScope.SPECIFIC_DISCORD_SERVER
        ? 'This server'
        : 'Network and friends'
    const noteLabel =
      playIntent.note.trim().length > 0
        ? `\nNote: ${playIntent.note.trim()}`
        : ''

    embed.addFields({
      name: `${playIntent.user.displayName} (@${playIntent.user.handle})`,
      value: [
        `**${playIntent.headline}**`,
        `Games: ${gamesLabel}`,
        `When: ${formatPlayIntentWindowLabel(playIntent.windowStartsAt, playIntent.windowEndsAt, playIntent.user.timezoneId)}`,
        `Audience: ${audienceLabel}`,
        `Interested: ${playIntent._count.notifications}`,
        noteLabel,
      ]
        .filter((line) => line.trim().length > 0)
        .join('\n'),
      inline: false,
    })

    const firstCover = playIntent.games.find((entry) =>
      Boolean(entry.game.coverUrl),
    )?.game.coverUrl

    if (!embed.data.image && firstCover) {
      embed.setImage(toClientGameCoverUrl(firstCover) ?? firstCover)
    }
  }

  if (visiblePlayIntents.length > limitedPlayIntents.length) {
    embed.setFooter({
      text: `Showing ${limitedPlayIntents.length} of ${visiblePlayIntents.length} active calls to play.`,
    })
  }

  await interaction.editReply({
    embeds: [embed],
    components: [
      buildInviteButtonRow(
        buildInviteLandingUrl({
          serverId,
          serverName: snapshot.serverName,
          inviterDiscordUserId: interaction.user.id,
          inviterLabel: toInviteSenderLabel(interaction),
          memberCount: snapshot.appMembers.length,
          kind: 'server',
        }),
      ),
    ],
  })
}

export async function registerDiscordSlashCommands() {
  if (!env.DISCORD_CLIENT_ID) {
    logger.info(
      'Discord slash command registration skipped: DISCORD_CLIENT_ID is not configured.',
    )
    return
  }

  const rest = getDiscordBotRest()

  if (!rest) {
    logger.info(
      'Discord slash command registration skipped: REST client is unavailable.',
    )
    return
  }

  try {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: slashCommands,
    })

    logger.info(`Registered ${slashCommands.length} Discord slash command(s).`)
  } catch (error) {
    logger.error('Failed to register Discord slash commands', { error })
  }
}

export async function handleDiscordSlashCommand(
  interaction: ChatInputCommandInteraction,
) {
  switch (interaction.commandName) {
    case 'invite-user':
      await handleInviteUserCommand(interaction)
      return
    case 'invite-link':
      await handleInviteLinkCommand(interaction)
      return
    case 'app-members':
      await handleAppMembersCommand(interaction)
      return
    case 'server-ctps':
      await handleServerCtpsCommand(interaction)
      return
    case 'post-ctp':
      await launchCtpComposer(interaction, {
        sourceServerId: interaction.guildId,
      })
      return
    case 'setup-ctp-post':
      await handleSetupCtpPostCommand(interaction)
      return
    default:
      await interaction.reply({
        content: "That Game's Up command is not available right now.",
        flags: MessageFlags.Ephemeral,
      })
  }
}
