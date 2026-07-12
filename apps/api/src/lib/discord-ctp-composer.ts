/**
 * Discord-side call-to-play composer: a step-by-step wizard mirroring the web
 * app's PlayIntentComposerCard (Basics -> Audience -> Timing -> Details ->
 * Review) rendered as one ephemeral message that updates in place.
 *
 * Entry points: the persistent "Start a call to play" button posted into an
 * adopted server channel by /setup-ctp-post, and the /post-ctp slash command
 * (guild or bot DM). All interactions use the `guild-ctp:` customId prefix so
 * routing stays stateless across bot restarts; per-user form state lives in a
 * DiscordCtpComposerDraft row (one per user, 24h TTL, lazily purged) so a
 * dismissed ephemeral message resumes instead of losing progress.
 *
 * Posting delegates to `upsertCurrentPlayIntent`, the same service the web
 * composer uses, so validation, audience rules, and notification side effects
 * stay identical; PlayIntentValidationError messages are surfaced inline on
 * the review step. Unlinked Discord users get the invite landing link that
 * preserves server context instead of the wizard.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  Routes,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type MessageActionRowComponentBuilder,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js'
import {
  AuthProvider,
  DiscordCtpComposerStartMode,
  DiscordCtpComposerStep,
  DiscordCtpComposerVoiceMode,
  PlayIntentScope,
  type DiscordCtpComposerDraft
} from '@prisma/client'
import { maximumPlayIntentGameSelectionCount, type PlayIntentNotifyScope, type UpsertPlayIntentRequest } from '@game-is-up/shared'
import { getDiscordBotRest } from './discord-bot-runtime.js'
import { buildOpenInAppButton } from './discord-dm-formatting.js'
import { parseComposerDurationInput, parseComposerStartInput } from './discord-ctp-composer-time.js'
import { buildInviteButtonRow, buildInviteLandingUrl, buildPlayUrl } from './discord-invite-links.js'
import { buildDiscordServerPreferences, buildSelectedDiscordVoiceChannels } from './discord-servers.js'
import { env } from './env.js'
import {
  getPlayableLibraryEntries,
  minimumPlayIntentDurationMinutes,
  PlayIntentValidationError,
  upsertCurrentPlayIntent
} from './play-intents.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'

const composerCustomIdPrefix = 'guild-ctp:'
const composerDraftTtlMs = 24 * 60 * 60 * 1000
const maximumTargetFriendCount = 25
const selectPageSize = 25
const composerEmbedColor = 0x33d7a6
const launchPostEmbedColor = 0x22c55e
const maximumDurationMinutes = 24 * 60

const stepOrder: DiscordCtpComposerStep[] = [
  DiscordCtpComposerStep.BASICS,
  DiscordCtpComposerStep.AUDIENCE,
  DiscordCtpComposerStep.TIMING,
  DiscordCtpComposerStep.DETAILS,
  DiscordCtpComposerStep.REVIEW
]

const stepLabels: Record<DiscordCtpComposerStep, string> = {
  [DiscordCtpComposerStep.BASICS]: 'Basics',
  [DiscordCtpComposerStep.AUDIENCE]: 'Audience',
  [DiscordCtpComposerStep.TIMING]: 'Timing',
  [DiscordCtpComposerStep.DETAILS]: 'Details',
  [DiscordCtpComposerStep.REVIEW]: 'Review'
}

const stepDescriptions: Record<DiscordCtpComposerStep, string> = {
  [DiscordCtpComposerStep.BASICS]: 'Pick the game(s) you are up for playing, and give the call an optional title.',
  [DiscordCtpComposerStep.AUDIENCE]: 'Choose who should see this call to play.',
  [DiscordCtpComposerStep.TIMING]: 'Choose when it starts and how long it stays live.',
  [DiscordCtpComposerStep.DETAILS]: 'Add an optional note and voice setup.',
  [DiscordCtpComposerStep.REVIEW]: 'Check everything, then post your call to play.'
}

const scopeSlugByScope: Record<PlayIntentScope, PlayIntentNotifyScope> = {
  [PlayIntentScope.FRIENDS_ONLY]: 'friends-only',
  [PlayIntentScope.MUTUAL_FRIENDS]: 'network',
  [PlayIntentScope.SPECIFIC_FRIENDS]: 'specific-friends',
  [PlayIntentScope.SPECIFIC_FRIENDS_LIST]: 'friends-list',
  [PlayIntentScope.SPECIFIC_DISCORD_SERVER]: 'specific-discord-server'
}

const scopeBySlug = Object.fromEntries(
  Object.entries(scopeSlugByScope).map(([scope, slug]) => [slug, scope as PlayIntentScope])
) as Record<PlayIntentNotifyScope, PlayIntentScope>

const scopeLabels: Record<PlayIntentScope, string> = {
  [PlayIntentScope.FRIENDS_ONLY]: 'Friends only',
  [PlayIntentScope.MUTUAL_FRIENDS]: 'Anyone in your network',
  [PlayIntentScope.SPECIFIC_FRIENDS]: 'Specific friends',
  [PlayIntentScope.SPECIFIC_FRIENDS_LIST]: 'Friends list',
  [PlayIntentScope.SPECIFIC_DISCORD_SERVER]: 'Specific Discord servers'
}

const scopeDescriptions: Record<PlayIntentScope, string> = {
  [PlayIntentScope.FRIENDS_ONLY]: 'Only people you added as friends, where there are matching games.',
  [PlayIntentScope.MUTUAL_FRIENDS]: 'Anyone in your network, plus your friends, where there are matching games.',
  [PlayIntentScope.SPECIFIC_FRIENDS]: 'Only the specific friends you choose, where there are matching games.',
  [PlayIntentScope.SPECIFIC_FRIENDS_LIST]: 'Only the friends saved in the list you choose, where there are matching games.',
  [PlayIntentScope.SPECIFIC_DISCORD_SERVER]: 'Only the in-app people from the selected network Discord servers, where there are matching games.'
}

type ComposerUser = {
  id: string;
  displayName: string;
  timezoneId: string;
};

type ComposerView = {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
};

export function isCtpComposerCustomId(customId: string) {
  return customId.startsWith(composerCustomIdPrefix)
}

function composerAction(customId: string) {
  return customId.slice(composerCustomIdPrefix.length)
}

function truncateLabel(value: string, maxLength = 100) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

// ---------------------------------------------------------------------------
// Linked user + draft persistence
// ---------------------------------------------------------------------------

async function resolveLinkedComposerUser(discordUserId: string): Promise<ComposerUser | null> {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: discordUserId
      }
    },
    select: {
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true
        }
      }
    }
  })

  return identity?.user ?? null
}

function nextDraftExpiry() {
  return new Date(Date.now() + composerDraftTtlMs)
}

async function loadDraftForUser(userId: string) {
  const draft = await prisma.discordCtpComposerDraft.findUnique({
    where: {
      userId
    }
  })

  if (draft && draft.expiresAt.getTime() <= Date.now()) {
    await prisma.discordCtpComposerDraft.delete({
      where: {
        id: draft.id
      }
    }).catch(() => undefined)
    return null
  }

  return draft
}

async function createDraft(user: ComposerUser, discordUserId: string, sourceServerId: string | null) {
  let notifyScope: PlayIntentScope = PlayIntentScope.FRIENDS_ONLY
  let targetDiscordServerIds: string[] = []
  // The source server is only recorded when we already track it; the bot can
  // be launched from guilds no member has synced yet, and the draft's FK must
  // not fail on those.
  let knownSourceServerId: string | null = null

  if (sourceServerId) {
    const server = await prisma.discordServer.findUnique({
      where: {
        id: sourceServerId
      },
      select: {
        id: true
      }
    })
    knownSourceServerId = server?.id ?? null
  }

  if (knownSourceServerId) {
    const preference = await prisma.discordServerPreference.findUnique({
      where: {
        userId_serverId: {
          userId: user.id,
          serverId: knownSourceServerId
        }
      },
      select: {
        includeInDiscovery: true
      }
    })

    if (preference?.includeInDiscovery) {
      notifyScope = PlayIntentScope.SPECIFIC_DISCORD_SERVER
      targetDiscordServerIds = [knownSourceServerId]
    }
  }

  return prisma.discordCtpComposerDraft.create({
    data: {
      userId: user.id,
      discordUserId,
      notifyScope,
      targetDiscordServerIds,
      sourceServerId: knownSourceServerId,
      expiresAt: nextDraftExpiry()
    }
  })
}

async function updateDraft(draftId: string, data: Parameters<typeof prisma.discordCtpComposerDraft.update>[0]['data']) {
  return prisma.discordCtpComposerDraft.update({
    where: {
      id: draftId
    },
    data: {
      ...data,
      expiresAt: nextDraftExpiry()
    }
  })
}

async function purgeExpiredDrafts() {
  await prisma.discordCtpComposerDraft.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Option loading
// ---------------------------------------------------------------------------

async function loadGameOptions(userId: string) {
  const entries = await getPlayableLibraryEntries(userId)

  // The library query orders by recency; the picker pages alphabetically so
  // games are findable. Sorting here keeps render and select-handling slices
  // aligned since both go through this loader.
  return entries
    .map((entry) => ({
      gameId: entry.gameId,
      title: entry.game.title
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
}

async function loadFriendOptions(userId: string) {
  const friends = await prisma.friend.findMany({
    where: {
      userId
    },
    select: {
      friendedUser: {
        select: {
          id: true,
          displayName: true,
          handle: true
        }
      }
    }
  })

  return friends
    .map((friend) => friend.friendedUser)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

async function loadFriendsListOptions(userId: string) {
  return prisma.friendsList.findMany({
    where: {
      userId
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          members: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  })
}

async function loadServerOptions(userId: string) {
  const preferences = await buildDiscordServerPreferences(userId)
  return preferences.servers.filter((server) => server.selected)
}

// ---------------------------------------------------------------------------
// Summary + formatting helpers
// ---------------------------------------------------------------------------

function formatDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  if (durationMinutes > 60) {
    const hours = Math.floor(durationMinutes / 60)
    return `${hours} hour${hours === 1 ? '' : 's'} ${durationMinutes % 60} minutes`
  }

  return `${durationMinutes} minutes`
}

function formatWhenSummary(draft: DiscordCtpComposerDraft, timezoneId: string) {
  if (draft.startMode === DiscordCtpComposerStartMode.SCHEDULED && draft.startAt) {
    const endsAt = new Date(draft.startAt.getTime() + draft.durationMinutes * 60 * 1000)
    return formatPlayIntentWindowLabel(draft.startAt, endsAt, timezoneId)
  }

  return `Starting now, live for ${formatDurationLabel(draft.durationMinutes)}`
}

async function buildAudienceSummary(draft: DiscordCtpComposerDraft) {
  const scopeLabel = scopeLabels[draft.notifyScope]

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS) {
    if (draft.targetUserIds.length === 0) {
      return `${scopeLabel} (none chosen yet)`
    }

    const friends = await prisma.user.findMany({
      where: {
        id: {
          in: draft.targetUserIds
        }
      },
      select: {
        displayName: true
      }
    })
    const names = friends.map((friend) => friend.displayName).sort((left, right) => left.localeCompare(right))
    const visible = names.slice(0, 6)
    const overflow = names.length - visible.length

    return `${scopeLabel}: ${visible.join(', ')}${overflow > 0 ? ` +${overflow} more` : ''}`
  }

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS_LIST) {
    if (!draft.targetFriendsListId) {
      return `${scopeLabel} (none chosen yet)`
    }

    const list = await prisma.friendsList.findUnique({
      where: {
        id: draft.targetFriendsListId
      },
      select: {
        name: true,
        _count: {
          select: {
            members: true
          }
        }
      }
    })

    return list
      ? `${scopeLabel}: ${list.name} (${list._count.members} ${list._count.members === 1 ? 'friend' : 'friends'})`
      : `${scopeLabel} (list no longer exists)`
  }

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_DISCORD_SERVER) {
    if (draft.targetDiscordServerIds.length === 0) {
      return `${scopeLabel} (none chosen yet)`
    }

    const servers = await prisma.discordServer.findMany({
      where: {
        id: {
          in: draft.targetDiscordServerIds
        }
      },
      select: {
        name: true
      }
    })

    return `${scopeLabel}: ${servers.map((server) => server.name).sort((left, right) => left.localeCompare(right)).join(', ')}`
  }

  return scopeLabel
}

function buildVoiceSummary(draft: DiscordCtpComposerDraft) {
  if (draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL && draft.voiceChannelName) {
    return `Existing channel: ${draft.voiceChannelName}`
  }

  if (draft.voiceMode === DiscordCtpComposerVoiceMode.TEMPORARY_SPACE) {
    return 'Temporary Discord channel in the Game\'s Up server'
  }

  return 'None'
}

async function buildDraftSummaryLines(draft: DiscordCtpComposerDraft, user: ComposerUser) {
  const games = draft.gameIds.length > 0
    ? await prisma.game.findMany({
        where: {
          id: {
            in: draft.gameIds
          }
        },
        select: {
          title: true
        }
      })
    : []
  const gameTitles = games.map((game) => game.title).sort((left, right) => left.localeCompare(right))

  return [
    `Title: ${draft.title.trim().length > 0 ? draft.title.trim() : '(default)'}`,
    `Games: ${gameTitles.length > 0 ? gameTitles.join(', ') : 'none chosen yet'}`,
    `Audience: ${await buildAudienceSummary(draft)}`,
    `When: ${formatWhenSummary(draft, user.timezoneId)}`,
    `Note: ${draft.note.trim().length > 0 ? draft.note.trim() : '(none)'}`,
    `Voice: ${buildVoiceSummary(draft)}`
  ]
}

function collectDraftIssues(draft: DiscordCtpComposerDraft) {
  const issues: string[] = []

  if (draft.gameIds.length === 0) {
    issues.push('Pick at least one game (Basics).')
  }

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS && draft.targetUserIds.length === 0) {
    issues.push('Choose at least one friend (Audience).')
  }

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS_LIST && !draft.targetFriendsListId) {
    issues.push('Choose a friends list (Audience).')
  }

  if (draft.notifyScope === PlayIntentScope.SPECIFIC_DISCORD_SERVER && draft.targetDiscordServerIds.length === 0) {
    issues.push('Choose at least one Discord server (Audience).')
  }

  if (draft.startMode === DiscordCtpComposerStartMode.SCHEDULED) {
    if (!draft.startAt) {
      issues.push('Set a start time (Timing).')
    } else if (draft.startAt.getTime() <= Date.now()) {
      issues.push('The scheduled start time has already passed (Timing).')
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

function composerButton(action: string, label: string, style: ButtonStyle, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(`${composerCustomIdPrefix}${action}`)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled)
}

function buildNavRow(step: DiscordCtpComposerStep) {
  const stepIndex = stepOrder.indexOf(step)
  const previousStep = stepIndex > 0 ? stepOrder[stepIndex - 1] : null
  const nextStep = stepIndex < stepOrder.length - 1 ? stepOrder[stepIndex + 1] : null
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  if (previousStep) {
    row.addComponents(composerButton(`goto:${previousStep}`, `Back: ${stepLabels[previousStep]}`, ButtonStyle.Secondary))
  }

  if (nextStep) {
    row.addComponents(composerButton(`goto:${nextStep}`, `Next: ${stepLabels[nextStep]}`, ButtonStyle.Primary))
  } else {
    row.addComponents(composerButton('post', 'Post call to play', ButtonStyle.Success))
  }

  row.addComponents(composerButton('cancel', 'Discard', ButtonStyle.Danger))

  return row
}

// Paging buttons name what they page ("More games") and sit next to a
// disabled page indicator so they cannot be mistaken for the wizard's
// "Next: ..." step navigation button.
function buildPageRow(kind: 'games' | 'friends', page: number, pageCount: number) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    composerButton(`${kind}:page:${page - 1}`, `< Prev ${kind}`, ButtonStyle.Secondary, page <= 0),
    composerButton(`${kind}:page-indicator`, `Page ${page + 1} of ${pageCount}`, ButtonStyle.Secondary, true),
    composerButton(`${kind}:page:${page + 1}`, `More ${kind} >`, ButtonStyle.Secondary, page >= pageCount - 1)
  )
}

function pageSlice<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / selectPageSize))
  const boundedPage = Math.min(Math.max(page, 0), pageCount - 1)

  return {
    pageCount,
    page: boundedPage,
    items: items.slice(boundedPage * selectPageSize, (boundedPage + 1) * selectPageSize)
  }
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

function buildComposerEmbed(draft: DiscordCtpComposerDraft, summaryLines: string[], notice: string | null, extraGuidance: string | null = null) {
  const stepIndex = stepOrder.indexOf(draft.step)
  const embed = new EmbedBuilder()
    .setColor(composerEmbedColor)
    .setTitle(`Post a call to play - ${stepLabels[draft.step]} (step ${stepIndex + 1} of ${stepOrder.length})`)
    .setDescription([
      notice ? `**${notice}**` : null,
      stepDescriptions[draft.step],
      extraGuidance
    ].filter((line): line is string => Boolean(line)).join('\n\n'))
    .addFields({
      name: 'Your call to play so far',
      value: summaryLines.join('\n')
    })

  return embed
}

async function renderComposerView(draft: DiscordCtpComposerDraft, user: ComposerUser, notice: string | null = null): Promise<ComposerView> {
  const summaryLines = await buildDraftSummaryLines(draft, user)
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  let extraGuidance: string | null = null

  switch (draft.step) {
    case DiscordCtpComposerStep.BASICS: {
      const gameOptions = await loadGameOptions(user.id)

      if (gameOptions.length === 0) {
        extraGuidance = 'Your Game\'s Up library has no playable games yet. Add games in the app first, then come back.'
        components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buildOpenInAppButton(buildPlayUrl(), 'Open Game\'s Up')))
      } else {
        const { items, page, pageCount } = pageSlice(gameOptions, draft.gamePage)
        const select = new StringSelectMenuBuilder()
          .setCustomId(`${composerCustomIdPrefix}select:games`)
          .setPlaceholder(`Pick up to ${maximumPlayIntentGameSelectionCount} games`)
          .setMinValues(0)
          .setMaxValues(Math.min(maximumPlayIntentGameSelectionCount, items.length))
          .addOptions(items.map((option) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(truncateLabel(option.title))
              .setValue(option.gameId)
              .setDefault(draft.gameIds.includes(option.gameId))
          )))

        components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select))

        if (pageCount > 1) {
          components.push(buildPageRow('games', page, pageCount))
        }

        extraGuidance = `${draft.gameIds.length} / ${maximumPlayIntentGameSelectionCount} games selected.`
      }

      const titleRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        composerButton('title:edit', draft.title.trim().length > 0 ? 'Edit title' : 'Set title (optional)', ButtonStyle.Secondary)
      )

      if (draft.title.trim().length > 0) {
        titleRow.addComponents(composerButton('title:clear', 'Clear title', ButtonStyle.Secondary))
      }

      components.push(titleRow)
      break
    }
    case DiscordCtpComposerStep.AUDIENCE: {
      const [friendOptions, listOptions, serverOptions] = await Promise.all([
        loadFriendOptions(user.id),
        loadFriendsListOptions(user.id),
        loadServerOptions(user.id)
      ])
      const availableScopes = [
        PlayIntentScope.MUTUAL_FRIENDS,
        PlayIntentScope.SPECIFIC_DISCORD_SERVER,
        PlayIntentScope.FRIENDS_ONLY,
        PlayIntentScope.SPECIFIC_FRIENDS,
        PlayIntentScope.SPECIFIC_FRIENDS_LIST
      ].filter((scope) => {
        if (scope === PlayIntentScope.SPECIFIC_FRIENDS) {
          return friendOptions.length > 0
        }

        if (scope === PlayIntentScope.SPECIFIC_FRIENDS_LIST) {
          return listOptions.length > 0
        }

        if (scope === PlayIntentScope.SPECIFIC_DISCORD_SERVER) {
          return serverOptions.length > 0
        }

        return true
      })

      const scopeSelect = new StringSelectMenuBuilder()
        .setCustomId(`${composerCustomIdPrefix}select:scope`)
        .setPlaceholder('Who do you want to target?')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(availableScopes.map((scope) => (
          new StringSelectMenuOptionBuilder()
            .setLabel(scopeLabels[scope])
            .setDescription(truncateLabel(scopeDescriptions[scope]))
            .setValue(scopeSlugByScope[scope])
            .setDefault(draft.notifyScope === scope)
        )))

      components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(scopeSelect))
      extraGuidance = scopeDescriptions[draft.notifyScope]

      if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS && friendOptions.length > 0) {
        const { items, page, pageCount } = pageSlice(friendOptions, draft.targetPage)
        const friendSelect = new StringSelectMenuBuilder()
          .setCustomId(`${composerCustomIdPrefix}select:friends`)
          .setPlaceholder('Choose which friends should see this call')
          .setMinValues(0)
          .setMaxValues(Math.min(maximumTargetFriendCount, items.length))
          .addOptions(items.map((friend) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(truncateLabel(friend.displayName))
              .setDescription(truncateLabel(`@${friend.handle}`))
              .setValue(friend.id)
              .setDefault(draft.targetUserIds.includes(friend.id))
          )))

        components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(friendSelect))

        if (pageCount > 1) {
          components.push(buildPageRow('friends', page, pageCount))
        }
      }

      if (draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS_LIST && listOptions.length > 0) {
        const listSelect = new StringSelectMenuBuilder()
          .setCustomId(`${composerCustomIdPrefix}select:friends-list`)
          .setPlaceholder('Choose a friends list')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(listOptions.slice(0, selectPageSize).map((list) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(truncateLabel(list.name))
              .setDescription(`${list._count.members} ${list._count.members === 1 ? 'friend' : 'friends'}`)
              .setValue(list.id)
              .setDefault(draft.targetFriendsListId === list.id)
          )))

        components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(listSelect))
      }

      if (draft.notifyScope === PlayIntentScope.SPECIFIC_DISCORD_SERVER && serverOptions.length > 0) {
        const serverSelect = new StringSelectMenuBuilder()
          .setCustomId(`${composerCustomIdPrefix}select:servers`)
          .setPlaceholder('Choose Discord servers to target')
          .setMinValues(0)
          .setMaxValues(Math.min(selectPageSize, serverOptions.length))
          .addOptions(serverOptions.slice(0, selectPageSize).map((server) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(truncateLabel(server.name))
              .setValue(server.id)
              .setDefault(draft.targetDiscordServerIds.includes(server.id))
          )))

        components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(serverSelect))
      }
      break
    }
    case DiscordCtpComposerStep.TIMING: {
      components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        composerButton('start:now', 'Start now', draft.startMode === DiscordCtpComposerStartMode.NOW ? ButtonStyle.Primary : ButtonStyle.Secondary),
        composerButton('start:in:30', 'In 30m', ButtonStyle.Secondary),
        composerButton('start:in:60', 'In 1h', ButtonStyle.Secondary),
        composerButton('start:in:120', 'In 2h', ButtonStyle.Secondary),
        composerButton('start:custom', 'Custom time...', ButtonStyle.Secondary)
      ))

      const durationSelect = new StringSelectMenuBuilder()
        .setCustomId(`${composerCustomIdPrefix}select:duration`)
        .setPlaceholder('How long should this stay live?')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          ...[60, 120, 240].map((minutes) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(formatDurationLabel(minutes))
              .setValue(String(minutes))
              .setDefault(draft.durationMinutes === minutes)
          )),
          new StringSelectMenuOptionBuilder()
            .setLabel('Custom length...')
            .setDescription('Enter a length in minutes or hours')
            .setValue('custom-length')
            .setDefault(![60, 120, 240].includes(draft.durationMinutes)),
          new StringSelectMenuOptionBuilder()
            .setLabel('Specific end time...')
            .setDescription('Enter when the call should end')
            .setValue('end-time')
        )

      components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(durationSelect))
      extraGuidance = `Times are read in your Game's Up timezone (${user.timezoneId}).`
      break
    }
    case DiscordCtpComposerStep.DETAILS: {
      const noteRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        composerButton('note:edit', draft.note.trim().length > 0 ? 'Edit note' : 'Add note (optional)', ButtonStyle.Secondary)
      )

      if (draft.note.trim().length > 0) {
        noteRow.addComponents(composerButton('note:clear', 'Clear note', ButtonStyle.Secondary))
      }

      components.push(noteRow)

      const voiceChannels = (await buildSelectedDiscordVoiceChannels(user.id)).channels
      const temporarySpaceAvailable = Boolean(env.DISCORD_SERVER_ID)
      const channelOptionBudget = selectPageSize - 1 - (temporarySpaceAvailable ? 1 : 0)
      const visibleChannels = voiceChannels.slice(0, channelOptionBudget)
      const voiceSelect = new StringSelectMenuBuilder()
        .setCustomId(`${composerCustomIdPrefix}select:voice`)
        .setPlaceholder('Voice setup (optional)')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('No voice channel')
            .setValue('none')
            .setDefault(draft.voiceMode === DiscordCtpComposerVoiceMode.NONE),
          ...(temporarySpaceAvailable
            ? [
                new StringSelectMenuOptionBuilder()
                  .setLabel('Temporary Discord channel')
                  .setDescription('A private channel in the Game\'s Up server, cleaned up afterward')
                  .setValue('space')
                  .setDefault(draft.voiceMode === DiscordCtpComposerVoiceMode.TEMPORARY_SPACE)
              ]
            : []),
          ...visibleChannels.map((channel) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(truncateLabel(channel.name))
              .setDescription(truncateLabel(channel.serverName))
              .setValue(`channel:${channel.id}`)
              .setDefault(draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL && draft.voiceChannelId === channel.id)
          ))
        )

      components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(voiceSelect))

      if (voiceChannels.length > visibleChannels.length) {
        extraGuidance = `Showing the first ${visibleChannels.length} voice channels from your selected servers. Use the app for the full list.`
      }
      break
    }
    case DiscordCtpComposerStep.REVIEW: {
      const issues = collectDraftIssues(draft)

      if (issues.length > 0) {
        extraGuidance = `Before this can be posted:\n${issues.map((issue) => `- ${issue}`).join('\n')}`
      } else {
        extraGuidance = 'Everything looks ready.'
      }
      break
    }
  }

  components.push(buildNavRow(draft.step))

  return {
    content: '',
    embeds: [buildComposerEmbed(draft, summaryLines, notice, extraGuidance)],
    components
  }
}

function buildClosedView(title: string, body: string, options: { includeRestart?: boolean; appUrl?: string | null } = {}): ComposerView {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  if (options.includeRestart ?? true) {
    row.addComponents(composerButton('open', 'Start a call to play', ButtonStyle.Primary))
  }

  if (options.appUrl) {
    row.addComponents(buildOpenInAppButton(options.appUrl, 'Open Game\'s Up'))
  }

  return {
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(composerEmbedColor)
        .setTitle(title)
        .setDescription(body)
    ],
    components: row.components.length > 0 ? [row] : []
  }
}

async function buildPostedView(draft: DiscordCtpComposerDraft, user: ComposerUser, notifiedFriendCount: number): Promise<ComposerView> {
  const summaryLines = await buildDraftSummaryLines(draft, user)

  return {
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(launchPostEmbedColor)
        .setTitle(draft.startMode === DiscordCtpComposerStartMode.SCHEDULED ? 'Call to play scheduled' : 'Call to play posted')
        .setDescription(`${notifiedFriendCount} ${notifiedFriendCount === 1 ? 'person was' : 'people were'} notified. Responses show up in the app and in your Game's Up DMs.`)
        .addFields({
          name: 'Summary',
          value: summaryLines.join('\n')
        })
    ],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildOpenInAppButton(buildPlayUrl(), 'Open Game\'s Up')
      )
    ]
  }
}

// ---------------------------------------------------------------------------
// Modal builders
// ---------------------------------------------------------------------------

function buildTextModal(options: {
  modalId: string;
  title: string;
  inputId: string;
  label: string;
  placeholder: string;
  value?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const input = new TextInputBuilder()
    .setCustomId(options.inputId)
    .setLabel(options.label)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(options.placeholder)
    .setRequired(options.required ?? false)

  if (options.maxLength) {
    input.setMaxLength(options.maxLength)
  }

  if (options.value && options.value.length > 0) {
    input.setValue(options.value)
  }

  return new ModalBuilder()
    .setCustomId(options.modalId)
    .setTitle(options.title)
    .addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input))
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

type ComposerEntryInteraction = ButtonInteraction | ChatInputCommandInteraction;

function buildUnlinkedView(interaction: ComposerEntryInteraction) {
  const serverId = interaction.guildId
  const serverName = interaction.guild?.name ?? null
  const inviteUrl = buildInviteLandingUrl({
    serverId,
    serverName,
    kind: serverId ? 'server' : 'direct'
  })

  return {
    content: 'Connect your Discord account to Game\'s Up first, then come back and try again.',
    embeds: [],
    components: [buildInviteButtonRow(inviteUrl)]
  }
}

/**
 * Opens (or resumes) the composer for the interacting Discord user. Replies
 * ephemerally from public entry points and edits in place when re-entered
 * from an ephemeral wizard message (e.g. the "Start a call to play" button on
 * a discarded-draft view).
 */
export async function launchCtpComposer(interaction: ComposerEntryInteraction, options: { sourceServerId: string | null }) {
  await purgeExpiredDrafts()

  const user = await resolveLinkedComposerUser(interaction.user.id)
  const canUpdateInPlace = interaction.isButton() && interaction.message.flags.has(MessageFlags.Ephemeral)

  if (!user) {
    const view = buildUnlinkedView(interaction)

    if (canUpdateInPlace && interaction.isButton()) {
      await interaction.update(view)
    } else {
      await interaction.reply({ ...view, flags: MessageFlags.Ephemeral })
    }
    return
  }

  const existingDraft = await loadDraftForUser(user.id)
  const draft = existingDraft ?? await createDraft(user, interaction.user.id, options.sourceServerId)
  const view = await renderComposerView(draft, user, existingDraft ? 'Resumed your saved draft.' : null)

  if (canUpdateInPlace && interaction.isButton()) {
    await interaction.update(view)
  } else {
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral })
  }
}

async function loadComposerSession(discordUserId: string) {
  const user = await resolveLinkedComposerUser(discordUserId)

  if (!user) {
    return null
  }

  const draft = await loadDraftForUser(user.id)

  if (!draft) {
    return null
  }

  return { user, draft }
}

const sessionEndedView = buildClosedView(
  'This composer session has ended',
  'The draft expired or was already posted. Start a new call to play whenever you are ready.'
)

// ---------------------------------------------------------------------------
// Button interactions
// ---------------------------------------------------------------------------

export async function handleCtpComposerButtonInteraction(interaction: ButtonInteraction) {
  try {
    const action = composerAction(interaction.customId)

    if (action === 'open') {
      await launchCtpComposer(interaction, { sourceServerId: interaction.guildId })
      return
    }

    const session = await loadComposerSession(interaction.user.id)

    if (!session) {
      await interaction.update(sessionEndedView)
      return
    }

    const { user, draft } = session

    if (action === 'title:edit') {
      await interaction.showModal(buildTextModal({
        modalId: `${composerCustomIdPrefix}modal:title`,
        title: 'Call to play title',
        inputId: 'title',
        label: 'Title (optional)',
        placeholder: 'Call to play',
        value: draft.title,
        maxLength: 80
      }))
      return
    }

    if (action === 'note:edit') {
      await interaction.showModal(buildTextModal({
        modalId: `${composerCustomIdPrefix}modal:note`,
        title: 'Call to play note',
        inputId: 'note',
        label: 'Note (optional)',
        placeholder: 'Example: voice chat on, happy to fill support',
        value: draft.note,
        maxLength: 140
      }))
      return
    }

    if (action === 'start:custom') {
      await interaction.showModal(buildTextModal({
        modalId: `${composerCustomIdPrefix}modal:start`,
        title: 'When should this start?',
        inputId: 'start',
        label: `Start time (${user.timezoneId})`,
        placeholder: '8pm, tomorrow 19:00, or in 45m',
        required: true
      }))
      return
    }

    if (action === 'post') {
      await postDraft(interaction, draft, user)
      return
    }

    let updatedDraft = draft
    let notice: string | null = null

    if (action.startsWith('goto:')) {
      const targetStep = action.slice('goto:'.length) as DiscordCtpComposerStep

      if (stepOrder.includes(targetStep)) {
        updatedDraft = await updateDraft(draft.id, { step: targetStep })
      }
    } else if (action === 'cancel') {
      await prisma.discordCtpComposerDraft.delete({
        where: {
          id: draft.id
        }
      }).catch(() => undefined)
      await interaction.update(buildClosedView('Draft discarded', 'Nothing was posted. Start a new call to play whenever you are ready.'))
      return
    } else if (action === 'title:clear') {
      updatedDraft = await updateDraft(draft.id, { title: '' })
    } else if (action === 'note:clear') {
      updatedDraft = await updateDraft(draft.id, { note: '' })
    } else if (action === 'start:now') {
      updatedDraft = await updateDraft(draft.id, { startMode: DiscordCtpComposerStartMode.NOW, startAt: null })
    } else if (action.startsWith('start:in:')) {
      const offsetMinutes = Number(action.slice('start:in:'.length))

      if (Number.isFinite(offsetMinutes) && offsetMinutes > 0) {
        updatedDraft = await updateDraft(draft.id, {
          startMode: DiscordCtpComposerStartMode.SCHEDULED,
          startAt: new Date(Date.now() + offsetMinutes * 60 * 1000)
        })
      }
    } else if (action.startsWith('games:page:')) {
      updatedDraft = await updateDraft(draft.id, { gamePage: Math.max(0, Number(action.slice('games:page:'.length)) || 0) })
    } else if (action.startsWith('friends:page:')) {
      updatedDraft = await updateDraft(draft.id, { targetPage: Math.max(0, Number(action.slice('friends:page:'.length)) || 0) })
    } else {
      notice = 'That control is not available right now.'
    }

    await interaction.update(await renderComposerView(updatedDraft, user, notice))
  } catch (error) {
    console.error('Discord CTP composer button interaction failed', error)
    await respondWithComposerFailure(interaction)
  }
}

// ---------------------------------------------------------------------------
// Select interactions
// ---------------------------------------------------------------------------

function mergePagedSelection(options: {
  current: string[];
  pageIds: string[];
  chosen: string[];
  cap: number;
}) {
  const kept = options.current.filter((id) => !options.pageIds.includes(id))
  const merged = [...kept, ...options.chosen.filter((id) => options.pageIds.includes(id))]

  return {
    merged: merged.slice(0, options.cap),
    truncated: merged.length > options.cap
  }
}

export async function handleCtpComposerSelectInteraction(interaction: StringSelectMenuInteraction) {
  try {
    const action = composerAction(interaction.customId)
    const session = await loadComposerSession(interaction.user.id)

    if (!session) {
      await interaction.update(sessionEndedView)
      return
    }

    const { user, draft } = session
    let updatedDraft = draft
    let notice: string | null = null

    if (action === 'select:games') {
      const gameOptions = await loadGameOptions(user.id)
      const { items } = pageSlice(gameOptions, draft.gamePage)
      const { merged, truncated } = mergePagedSelection({
        current: draft.gameIds,
        pageIds: items.map((option) => option.gameId),
        chosen: interaction.values,
        cap: maximumPlayIntentGameSelectionCount
      })

      updatedDraft = await updateDraft(draft.id, { gameIds: merged })

      if (truncated) {
        notice = `Calls to play can include up to ${maximumPlayIntentGameSelectionCount} games, so the extra picks were dropped.`
      }
    } else if (action === 'select:scope') {
      const slug = interaction.values[0] as PlayIntentNotifyScope
      const scope = scopeBySlug[slug]

      if (scope) {
        updatedDraft = await updateDraft(draft.id, { notifyScope: scope, targetPage: 0 })
      }
    } else if (action === 'select:friends') {
      const friendOptions = await loadFriendOptions(user.id)
      const { items } = pageSlice(friendOptions, draft.targetPage)
      const { merged, truncated } = mergePagedSelection({
        current: draft.targetUserIds,
        pageIds: items.map((friend) => friend.id),
        chosen: interaction.values,
        cap: maximumTargetFriendCount
      })

      updatedDraft = await updateDraft(draft.id, { targetUserIds: merged })

      if (truncated) {
        notice = `You can target up to ${maximumTargetFriendCount} specific friends, so the extra picks were dropped.`
      }
    } else if (action === 'select:friends-list') {
      updatedDraft = await updateDraft(draft.id, { targetFriendsListId: interaction.values[0] ?? null })
    } else if (action === 'select:servers') {
      updatedDraft = await updateDraft(draft.id, { targetDiscordServerIds: interaction.values })
    } else if (action === 'select:duration') {
      const choice = interaction.values[0]

      if (choice === 'custom-length') {
        await interaction.showModal(buildTextModal({
          modalId: `${composerCustomIdPrefix}modal:duration`,
          title: 'How long should this stay live?',
          inputId: 'duration',
          label: `Length (${minimumPlayIntentDurationMinutes}m to 24h)`,
          placeholder: '90, 2h, or 1h30m',
          required: true
        }))
        return
      }

      if (choice === 'end-time') {
        await interaction.showModal(buildTextModal({
          modalId: `${composerCustomIdPrefix}modal:end-time`,
          title: 'When should this end?',
          inputId: 'end',
          label: `End time (${user.timezoneId})`,
          placeholder: '11pm, tomorrow 01:00, or in 3h',
          required: true
        }))
        return
      }

      const minutes = Number(choice)

      if ([60, 120, 240].includes(minutes)) {
        updatedDraft = await updateDraft(draft.id, { durationMinutes: minutes })
      }
    } else if (action === 'select:voice') {
      const choice = interaction.values[0]

      if (choice === 'none') {
        updatedDraft = await updateDraft(draft.id, {
          voiceMode: DiscordCtpComposerVoiceMode.NONE,
          voiceChannelId: null,
          voiceChannelName: null
        })
      } else if (choice === 'space') {
        updatedDraft = await updateDraft(draft.id, {
          voiceMode: DiscordCtpComposerVoiceMode.TEMPORARY_SPACE,
          voiceChannelId: null,
          voiceChannelName: null
        })
      } else if (choice?.startsWith('channel:')) {
        const channelId = choice.slice('channel:'.length)
        const channels = (await buildSelectedDiscordVoiceChannels(user.id)).channels
        const channel = channels.find((candidate) => candidate.id === channelId)

        if (channel) {
          updatedDraft = await updateDraft(draft.id, {
            voiceMode: DiscordCtpComposerVoiceMode.EXISTING_CHANNEL,
            voiceChannelId: channel.id,
            voiceChannelName: channel.name
          })
        } else {
          notice = 'That voice channel is no longer available.'
        }
      }
    }

    await interaction.update(await renderComposerView(updatedDraft, user, notice))
  } catch (error) {
    console.error('Discord CTP composer select interaction failed', error)
    await respondWithComposerFailure(interaction)
  }
}

// ---------------------------------------------------------------------------
// Modal submissions
// ---------------------------------------------------------------------------

export async function handleCtpComposerModalSubmit(interaction: ModalSubmitInteraction) {
  try {
    const action = composerAction(interaction.customId)
    const session = await loadComposerSession(interaction.user.id)

    if (!interaction.isFromMessage()) {
      await interaction.reply({ content: 'This composer session has ended.', flags: MessageFlags.Ephemeral })
      return
    }

    if (!session) {
      await interaction.update(sessionEndedView)
      return
    }

    const { user, draft } = session
    let updatedDraft = draft
    let notice: string | null = null

    if (action === 'modal:title') {
      updatedDraft = await updateDraft(draft.id, { title: interaction.fields.getTextInputValue('title').trim().slice(0, 80) })
    } else if (action === 'modal:note') {
      updatedDraft = await updateDraft(draft.id, { note: interaction.fields.getTextInputValue('note').trim().slice(0, 140) })
    } else if (action === 'modal:start') {
      const parsed = parseComposerStartInput(interaction.fields.getTextInputValue('start'), user.timezoneId, new Date())

      if (parsed.kind === 'error') {
        notice = parsed.error
      } else if (parsed.kind === 'now') {
        updatedDraft = await updateDraft(draft.id, { startMode: DiscordCtpComposerStartMode.NOW, startAt: null })
      } else {
        updatedDraft = await updateDraft(draft.id, { startMode: DiscordCtpComposerStartMode.SCHEDULED, startAt: parsed.startAt })
      }
    } else if (action === 'modal:duration') {
      const parsed = parseComposerDurationInput(interaction.fields.getTextInputValue('duration'))

      if ('error' in parsed) {
        notice = parsed.error
      } else if (parsed.minutes < minimumPlayIntentDurationMinutes || parsed.minutes > maximumDurationMinutes) {
        notice = `Calls to play stay live between ${minimumPlayIntentDurationMinutes} minutes and 24 hours.`
      } else {
        updatedDraft = await updateDraft(draft.id, { durationMinutes: parsed.minutes })
      }
    } else if (action === 'modal:end-time') {
      const now = new Date()
      const parsed = parseComposerStartInput(interaction.fields.getTextInputValue('end'), user.timezoneId, now)

      if (parsed.kind === 'error') {
        notice = parsed.error
      } else if (parsed.kind === 'now') {
        notice = 'Choose an end time that is later than the start.'
      } else {
        const startsAt = draft.startMode === DiscordCtpComposerStartMode.SCHEDULED && draft.startAt ? draft.startAt : now
        const minutes = Math.round((parsed.startAt.getTime() - startsAt.getTime()) / (60 * 1000))

        if (minutes < minimumPlayIntentDurationMinutes) {
          notice = `Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes after the session starts.`
        } else if (minutes > maximumDurationMinutes) {
          notice = 'Calls to play can stay live for up to 24 hours.'
        } else {
          updatedDraft = await updateDraft(draft.id, { durationMinutes: minutes })
        }
      }
    }

    await interaction.update(await renderComposerView(updatedDraft, user, notice))
  } catch (error) {
    console.error('Discord CTP composer modal submission failed', error)
    await respondWithComposerFailure(interaction)
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

async function postDraft(interaction: ButtonInteraction, draft: DiscordCtpComposerDraft, user: ComposerUser) {
  const issues = collectDraftIssues(draft)

  if (issues.length > 0) {
    const reviewDraft = draft.step === DiscordCtpComposerStep.REVIEW ? draft : await updateDraft(draft.id, { step: DiscordCtpComposerStep.REVIEW })
    await interaction.update(await renderComposerView(reviewDraft, user, 'A few things need attention before posting.'))
    return
  }

  await interaction.deferUpdate()

  const payload: UpsertPlayIntentRequest = {
    selectionMode: 'subset',
    notifyScope: scopeSlugByScope[draft.notifyScope],
    includeSelf: false,
    createDiscordSpace: draft.voiceMode === DiscordCtpComposerVoiceMode.TEMPORARY_SPACE,
    gameIds: draft.gameIds,
    targetUserIds: draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS ? draft.targetUserIds : [],
    targetFriendsListId: draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS_LIST ? draft.targetFriendsListId ?? undefined : undefined,
    targetDiscordServerIds: draft.notifyScope === PlayIntentScope.SPECIFIC_DISCORD_SERVER ? draft.targetDiscordServerIds : [],
    title: draft.title.trim().length > 0 ? draft.title.trim() : undefined,
    note: draft.note.trim(),
    startAt: draft.startMode === DiscordCtpComposerStartMode.SCHEDULED && draft.startAt ? draft.startAt.toISOString() : undefined,
    durationMinutes: draft.durationMinutes,
    voiceChannelId: draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL ? draft.voiceChannelId ?? undefined : undefined,
    voiceChannelName: draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL ? draft.voiceChannelName ?? undefined : undefined
  }

  try {
    const response = await upsertCurrentPlayIntent(user.id, payload)

    await prisma.discordCtpComposerDraft.delete({
      where: {
        id: draft.id
      }
    }).catch(() => undefined)

    await interaction.editReply(await buildPostedView(draft, user, response.notifiedFriendCount))
  } catch (error) {
    const message = error instanceof PlayIntentValidationError
      ? error.message
      : 'Something went wrong while posting your call to play. Try again in a moment.'

    if (!(error instanceof PlayIntentValidationError)) {
      console.error('Discord CTP composer post failed', error)
    }

    const reviewDraft = draft.step === DiscordCtpComposerStep.REVIEW ? draft : await updateDraft(draft.id, { step: DiscordCtpComposerStep.REVIEW })
    await interaction.editReply(await renderComposerView(reviewDraft, user, message))
  }
}

async function respondWithComposerFailure(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  const content = 'Something went wrong in the composer. Try that step again.'

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral })
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral })
    }
  } catch {
    // The interaction token may have expired; nothing else to do.
  }
}

// ---------------------------------------------------------------------------
// Channel launch post (/setup-ctp-post)
// ---------------------------------------------------------------------------

function buildLaunchPostPayload() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(launchPostEmbedColor)
        .setTitle('Game\'s Up - rally people to play')
        .setDescription([
          'Up for a game? Press the button below to post a call to play without leaving Discord. You choose who sees it - your whole Game\'s Up network, specific friends, or specific servers.',
          'You will pick games, audience, and timing in a private step-by-step composer that only you can see. You need a Game\'s Up account linked to your Discord to post one.'
        ].join('\n\n'))
    ],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        composerButton('open', 'Start a call to play', ButtonStyle.Primary),
        buildOpenInAppButton(buildPlayUrl(), 'Open Game\'s Up')
      )
    ]
  }
}

/**
 * Applies or lifts the optional launch-channel lock: denying send/thread
 * permissions for @everyone keeps the button post from being buried, while an
 * explicit allow overwrite for the bot keeps re-runs able to post. Passing
 * `lock: false` clears only the specific denies this lock sets, leaving any
 * other admin-managed overwrites on the channel alone.
 */
async function applyLaunchChannelLock(channel: GuildTextBasedChannel, lock: boolean) {
  if (!('permissionOverwrites' in channel)) {
    return 'Threads cannot be locked this way, so the channel permissions were left unchanged.'
  }

  const reason = lock
    ? 'Keep the Game\'s Up call-to-play post visible'
    : 'Reopen the Game\'s Up call-to-play channel'

  try {
    if (lock) {
      const botMember = channel.guild.members.me

      if (botMember) {
        await channel.permissionOverwrites.edit(botMember, {
          SendMessages: true,
          EmbedLinks: true
        }, { reason })
      }

      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false
      }, { reason })

      return 'Members can no longer send messages in this channel.'
    }

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      SendMessages: null,
      SendMessagesInThreads: null,
      CreatePublicThreads: null,
      CreatePrivateThreads: null
    }, { reason })

    return 'Members can send messages in this channel again.'
  } catch (error) {
    console.error('Failed to update the call-to-play channel lock', error)
    return `I could not ${lock ? 'lock' : 'unlock'} the channel - make sure the Game's Up bot has the Manage Roles permission here, then re-run the command.`
  }
}

/**
 * Posts (or re-posts) the persistent call-to-play launch message in the
 * invoking channel and records its location on the DiscordServer row so a
 * later re-run can replace the previous post instead of stacking duplicates.
 * The optional `lock-channel` option denies member sends in the channel so
 * the post stays visible (or lifts that lock when false).
 */
export async function handleSetupCtpPostCommand(interaction: ChatInputCommandInteraction) {
  const serverId = interaction.guildId
  const guild = interaction.guild

  if (!serverId || !guild) {
    await interaction.reply({
      content: 'This command only works in a server.',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the Manage Server permission to set up the call-to-play post.',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const channel = interaction.channel

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await interaction.reply({
      content: 'Run this in the text channel where the call-to-play button should live.',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const targetChannel = channel as GuildTextBasedChannel

  if (targetChannel.isThread() && (targetChannel.archived || targetChannel.locked)) {
    await interaction.editReply({
      content: `This thread is ${targetChannel.archived ? 'archived' : 'locked'}, so I cannot post here. Reopen it or run the command in another channel.`
    })
    return
  }

  // Preflight the exact permissions channel.send needs so failures name the
  // missing bot permission instead of a generic error. Threads gate sends
  // behind Send Messages in Threads on the parent channel.
  const botMember = guild.members.me
  const channelPermissions = botMember ? targetChannel.permissionsFor(botMember) : null
  const requiredPermissions: Array<{ flag: bigint; label: string }> = [
    { flag: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    targetChannel.isThread()
      ? { flag: PermissionFlagsBits.SendMessagesInThreads, label: 'Send Messages in Threads' }
      : { flag: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
    { flag: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' }
  ]
  const missingPermissionLabels = channelPermissions
    ? requiredPermissions.filter(({ flag }) => !channelPermissions.has(flag)).map(({ label }) => label)
    : []

  if (missingPermissionLabels.length > 0) {
    await interaction.editReply({
      content: `The Game's Up bot is missing the following permission${missingPermissionLabels.length === 1 ? '' : 's'} here: ${missingPermissionLabels.join(', ')}. Grant ${missingPermissionLabels.length === 1 ? 'it' : 'them'} on this channel${targetChannel.isThread() ? ' (or its parent channel)' : ''}, then try again.`
    })
    return
  }

  const server = await prisma.discordServer.upsert({
    where: {
      id: serverId
    },
    create: {
      id: serverId,
      name: guild.name,
      iconHash: guild.icon
    },
    update: {
      name: guild.name,
      iconHash: guild.icon
    }
  })

  let message

  try {
    message = await targetChannel.send(buildLaunchPostPayload())
  } catch (error) {
    console.error('Failed to post the call-to-play launch message', error)
    await interaction.editReply({
      content: `I could not post in this channel${error instanceof Error && error.message ? ` (Discord said: ${error.message})` : ''}. Make sure the Game's Up bot can send messages and embeds here, then try again.`
    })
    return
  }

  if (server.ctpComposerChannelId && server.ctpComposerMessageId) {
    const rest = getDiscordBotRest()

    if (rest && !(server.ctpComposerChannelId === message.channelId && server.ctpComposerMessageId === message.id)) {
      await rest.delete(Routes.channelMessage(server.ctpComposerChannelId, server.ctpComposerMessageId)).catch(() => undefined)
    }
  }

  await prisma.discordServer.update({
    where: {
      id: serverId
    },
    data: {
      ctpComposerChannelId: message.channelId,
      ctpComposerMessageId: message.id,
      ctpComposerPostedAt: new Date()
    }
  })

  const lockChannel = interaction.options.getBoolean('lock-channel')
  const lockNote = lockChannel !== null
    ? await applyLaunchChannelLock(targetChannel, lockChannel)
    : null

  await interaction.editReply({
    content: [
      `Done. The call-to-play button now lives in this channel${server.ctpComposerMessageId ? ' (the previous post was removed)' : ''}.`,
      lockNote,
      targetChannel.isThread()
        ? 'Heads up: threads auto-archive after inactivity, which hides this post - a regular text channel keeps the button visible.'
        : null,
      'Re-run /setup-ctp-post any time to refresh or move it.'
    ].filter((part): part is string => Boolean(part)).join(' ')
  })
}
