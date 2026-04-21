import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Message,
  type MessageActionRowComponentBuilder
} from 'discord.js'
import { AuthProvider } from '@prisma/client'
import { deleteDiscordDirectMessage } from './discord-bot-runtime.js'
import { buildOpenInAppButton, buildDiscordMessageHeading } from './discord-dm-formatting.js'
import { deleteSettledDiscordDirectMessagesForUser } from './discord-dm-cleanup.js'
import { env } from './env.js'
import { clearCurrentPlayIntent, getCurrentPlayIntent } from './play-intents.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'

type DirectMessageCommandName = 'help' | 'status' | 'end' | 'autoplay' | 'cleanup'

type ParsedDirectMessageCommand = {
  name: DirectMessageCommandName;
  args: string[];
} | {
  name: 'unknown';
  args: string[];
}

type DirectMessageReplyOptions = {
  dismissButtonForUserId?: string;
  autoDeleteAfterMs?: number;
  includeOpenAppButton?: boolean;
}

type DirectMessageReply = (content: string, options?: DirectMessageReplyOptions) => Promise<void>

type DirectMessageCommandContext = {
  authorId: string;
  reply: DirectMessageReply;
}

type DirectMessageCommandPayload = {
  authorId: string;
  content: string;
  source: string;
  reply: DirectMessageReply;
}

const directMessageCommandAliases = new Map<string, DirectMessageCommandName>([
  ['help', 'help'],
  ['commands', 'help'],
  ['menu', 'help'],
  ['status', 'status'],
  ['state', 'status'],
  ['end', 'end'],
  ['stop', 'end'],
  ['autoplay', 'autoplay'],
  ['auto-play', 'autoplay'],
  ['autoprompt', 'autoplay'],
  ['auto-prompt', 'autoplay'],
  ['cleanup', 'cleanup'],
  ['clean', 'cleanup']
])

const DISCORD_DM_FETCH_TIMEOUT_MS = 5_000
const CLEANUP_COMMAND_REPLY_LIFETIME_MS = 10_000
const directMessageCommandDismissPrefix = 'dm-command'

function buildPlayUrl() {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function buildOpenAppRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildOpenInAppButton(buildPlayUrl())
  )
}

function buildDirectMessageDismissCustomId(discordUserId: string) {
  return `${directMessageCommandDismissPrefix}:${discordUserId}:dismiss`
}

function buildDismissAndOpenAppRow(discordUserId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildDirectMessageDismissCustomId(discordUserId))
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary),
    buildOpenInAppButton(buildPlayUrl())
  )
}

export function buildDirectMessageReplyPayload(content: string, options: DirectMessageReplyOptions = {}) {
  const components = options.dismissButtonForUserId
    ? [buildDismissAndOpenAppRow(options.dismissButtonForUserId)]
    : options.includeOpenAppButton === false
      ? []
      : [buildOpenAppRow()]

  return {
    content,
    components
  }
}

function scheduleDirectMessageDeletion(message: Message, delayMs: number) {
  const timeout = setTimeout(() => {
    void deleteDiscordDirectMessage({
      channelId: message.channelId,
      messageId: message.id
    }).catch(() => {
      void message.delete().catch(() => {})
    })
  }, delayMs)

  timeout.unref?.()
}

function parseDirectMessageCommandButtonAction(customId: string) {
  const [prefix, discordUserId, action] = customId.split(':')

  if (prefix !== directMessageCommandDismissPrefix || !discordUserId || action !== 'dismiss') {
    return null
  }

  return {
    discordUserId,
    action
  }
}

function parseDirectMessageCommand(content: string): ParsedDirectMessageCommand | null {
  const trimmed = content.trim()

  if (trimmed.length === 0) {
    return null
  }

  const isSlashLike = trimmed.startsWith('/')
  const normalized = isSlashLike ? trimmed.slice(1).trim() : trimmed

  if (normalized.length === 0) {
    return {
      name: 'help',
      args: []
    }
  }

  const [rawCommand = '', ...rawArgs] = normalized.split(/\s+/)
  const name = directMessageCommandAliases.get(rawCommand.toLowerCase())

  if (!name) {
    return isSlashLike
      ? {
          name: 'unknown',
          args: rawArgs.map((arg) => arg.toLowerCase())
        }
      : null
  }

  return {
    name,
    args: rawArgs.map((arg) => arg.toLowerCase())
  }
}

async function resolveDirectMessageContent(message: Message) {
  const gatewayContent = typeof message.content === 'string' ? message.content : ''

  if (gatewayContent.trim().length > 0) {
    return {
      content: gatewayContent,
      source: 'gateway' as const
    }
  }

  try {
    console.log(`Discord DM missing gateway content for ${message.author.id}; attempting message.fetch().`)

    const fetchedMessage = await new Promise<Message>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Discord DM fetch timed out after ${DISCORD_DM_FETCH_TIMEOUT_MS}ms`))
      }, DISCORD_DM_FETCH_TIMEOUT_MS)

      void message.fetch().then(resolve, reject).finally(() => {
        clearTimeout(timeout)
      })
    })

    const fetchedContent = typeof fetchedMessage.content === 'string' ? fetchedMessage.content : ''

    return {
      content: fetchedContent,
      source: fetchedContent.trim().length > 0 ? 'fetch' as const : 'empty' as const
    }
  } catch (error) {
    console.error('Failed to fetch Discord DM content', error)
    return {
      content: gatewayContent,
      source: error instanceof Error && error.message.includes('timed out') ? 'fetch-timeout' as const : 'fetch-failed' as const
    }
  }
}

function summarizeDirectMessageToken(content: string) {
  const trimmed = content.trim()

  if (trimmed.length === 0) {
    return '(empty)'
  }

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1).trim() : trimmed

  if (normalized.length === 0) {
    return '/'
  }

  const [token = ''] = normalized.split(/\s+/, 1)
  return token.toLowerCase()
}

function summarizeGames(games: { title: string }[], selectionMode: 'library' | 'subset') {
  if (selectionMode === 'library') {
    return 'Any game in your library.'
  }

  const titles = games.map((game) => game.title)

  if (titles.length <= 4) {
    return titles.join(', ')
  }

  return `${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function describeNotifyScope(activeIntent: NonNullable<Awaited<ReturnType<typeof getCurrentPlayIntent>>>) {
  switch (activeIntent.notifyScope) {
    case 'friends-only':
      return 'Friends only.'
    case 'specific-friends':
      return activeIntent.targetedFriends.length > 0
        ? `${activeIntent.targetedFriends.length} selected friend${activeIntent.targetedFriends.length === 1 ? '' : 's'}.`
        : 'Selected friends.'
    case 'specific-discord-server':
      return activeIntent.targetServers.length > 0
        ? activeIntent.targetServers.map((server: { name: string }) => server.name).join(', ')
        : 'Selected Discord servers.'
    default:
      return 'Your network plus friends.'
  }
}

async function resolveDiscordIdentity(discordUserId: string) {
  return prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: discordUserId
      }
    },
    select: {
      userId: true,
      user: {
        select: {
          displayName: true,
          timezoneId: true,
          discordAutoPromptPlayIntent: true
        }
      }
    }
  })
}

async function replyToDirectMessage(message: Message, content: string, options: DirectMessageReplyOptions = {}) {
  const payload = buildDirectMessageReplyPayload(content, options)

  try {
    const sentMessage = await message.reply(payload)

    if (options.autoDeleteAfterMs && options.autoDeleteAfterMs > 0) {
      scheduleDirectMessageDeletion(sentMessage, options.autoDeleteAfterMs)
    }

    return
  } catch {
    if ('send' in message.channel && typeof message.channel.send === 'function') {
      const sentMessage = await message.channel.send(payload)

      if (options.autoDeleteAfterMs && options.autoDeleteAfterMs > 0) {
        scheduleDirectMessageDeletion(sentMessage, options.autoDeleteAfterMs)
      }

      return
    }

    throw new Error('Discord DM channel is not sendable.')
  }
}

async function replyWithLinkPrompt(reply: DirectMessageReply) {
  await reply(
    [
      buildDiscordMessageHeading('Link your Game\'s Up account'),
      'I could not match this Discord DM to a linked Game\'s Up account.',
      'Open the app, sign in with Discord, and then try again.'
    ].join('\n\n')
  )
}

function buildHelpMessage() {
  return [
    buildDiscordMessageHeading('Game\'s Up DM commands'),
    'Send any of these commands in this DM. A leading slash also works.',
    '- `help` shows this command list.',
    '- `status` shows your latest active call to play and auto-play prompt setting.',
    '- `end` ends your active calls to play.',
    '- `autoplay` shows whether Discord auto-play prompts are on.',
    '- `autoplay on` enables Discord auto-play prompts.',
    '- `autoplay off` disables Discord auto-play prompts.',
    '- `cleanup` removes old bot messages and settled prompts while preserving any still-active tracked messages.'
  ].join('\n\n')
}

async function handleStatusCommand(context: DirectMessageCommandContext, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const activeIntent = await getCurrentPlayIntent(identity.userId)

  if (!activeIntent) {
    await context.reply(
      [
        buildDiscordMessageHeading('Current status'),
        'Calls to play: None active.',
        `Auto-play prompts: ${identity.user.discordAutoPromptPlayIntent ? 'On' : 'Off'}.`
      ].join('\n\n')
    )
    return
  }

  const whenLabel = formatPlayIntentWindowLabel(
    new Date(activeIntent.windowStartsAt),
    new Date(activeIntent.windowEndsAt),
    identity.user.timezoneId
  )
  const interestedSummary = activeIntent.interestedCount === 0
    ? 'Nobody has responded yet.'
    : `${activeIntent.interestedCount} ${activeIntent.interestedCount === 1 ? 'person is' : 'people are'} interested.`

  await context.reply(
    [
      buildDiscordMessageHeading('Current status'),
      `Latest call to play: ${activeIntent.title}`,
      `Games: ${summarizeGames(activeIntent.games, activeIntent.selectionMode)}`,
      `When: ${whenLabel}`,
      `Audience: ${describeNotifyScope(activeIntent)}`,
      `Interest: ${interestedSummary}`,
      `Auto-play prompts: ${identity.user.discordAutoPromptPlayIntent ? 'On' : 'Off'}.`,
      activeIntent.note.trim().length > 0 ? `Note: ${activeIntent.note.trim()}` : null
    ].filter((part): part is string => Boolean(part)).join('\n\n')
  )
}

async function handleEndCommand(context: DirectMessageCommandContext, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const activeIntent = await getCurrentPlayIntent(identity.userId)

  if (!activeIntent) {
    await context.reply(
      [
        buildDiscordMessageHeading('No active call to play'),
        'There are no active calls to play to end right now.'
      ].join('\n\n')
    )
    return
  }

  await clearCurrentPlayIntent(identity.userId)

  await context.reply(
    [
      buildDiscordMessageHeading('Call to play ended'),
      `Ended: ${activeIntent.title}`,
      'Any of your currently active calls to play are now marked as ended.'
    ].join('\n\n')
  )
}

async function handleAutoplayCommand(
  context: DirectMessageCommandContext,
  identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>,
  args: string[]
) {
  const requestedState = args[0]

  if (!requestedState) {
    await context.reply(
      [
        buildDiscordMessageHeading('Auto-play prompts'),
        `Discord auto-play prompts are currently ${identity.user.discordAutoPromptPlayIntent ? 'on' : 'off'}.`
      ].join('\n\n')
    )
    return
  }

  const nextValue = requestedState === 'on' || requestedState === 'enable'
    ? true
    : requestedState === 'off' || requestedState === 'disable'
      ? false
      : null

  if (nextValue == null) {
    await context.reply(
      [
        buildDiscordMessageHeading('Auto-play prompts'),
        'Use `autoplay`, `autoplay on`, or `autoplay off`.'
      ].join('\n\n')
    )
    return
  }

  if (identity.user.discordAutoPromptPlayIntent === nextValue) {
    await context.reply(
      [
        buildDiscordMessageHeading('Auto-play prompts'),
        `Discord auto-play prompts are already ${nextValue ? 'on' : 'off'}.`
      ].join('\n\n')
    )
    return
  }

  await prisma.user.update({
    where: {
      id: identity.userId
    },
    data: {
      discordAutoPromptPlayIntent: nextValue
    }
  })

  await context.reply(
    [
      buildDiscordMessageHeading('Auto-play prompts updated'),
      `Discord auto-play prompts are now ${nextValue ? 'on' : 'off'}.`
    ].join('\n\n')
  )
}

async function handleCleanupCommand(context: DirectMessageCommandContext, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const result = await deleteSettledDiscordDirectMessagesForUser(identity.userId)

  if (result.attemptedCount === 0) {
    await context.reply(
      [
        buildDiscordMessageHeading('Nothing to clean up'),
        'There are no older bot messages or settled prompts to remove right now.'
      ].join('\n\n'),
      {
        autoDeleteAfterMs: CLEANUP_COMMAND_REPLY_LIFETIME_MS,
        includeOpenAppButton: false
      }
    )
    return
  }

  const summary = result.deletedCount === result.attemptedCount
    ? `Removed ${result.deletedCount} Discord bot message${result.deletedCount === 1 ? '' : 's'}.`
    : `Removed ${result.deletedCount} of ${result.attemptedCount} Discord bot messages.`

  await context.reply(
    [
      buildDiscordMessageHeading('Cleanup complete'),
      summary
    ].join('\n\n'),
    {
      autoDeleteAfterMs: CLEANUP_COMMAND_REPLY_LIFETIME_MS,
      includeOpenAppButton: false
    }
  )
}

async function executeDirectMessageCommand(context: DirectMessageCommandContext, parsedCommand: ParsedDirectMessageCommand) {
  if (parsedCommand.name === 'help') {
    await context.reply(buildHelpMessage())
    return
  }

  if (parsedCommand.name === 'unknown') {
    await context.reply(
      [
        buildDiscordMessageHeading('Unknown command'),
        'Use `help` to see the available DM commands.'
      ].join('\n\n')
    )
    return
  }

  const identity = await resolveDiscordIdentity(context.authorId)

  if (!identity) {
    await replyWithLinkPrompt(context.reply)
    return
  }

  switch (parsedCommand.name) {
    case 'status':
      await handleStatusCommand(context, identity)
      return
    case 'end':
      await handleEndCommand(context, identity)
      return
    case 'autoplay':
      await handleAutoplayCommand(context, identity, parsedCommand.args)
      return
    case 'cleanup':
      await handleCleanupCommand(context, identity)
      return
    default:
      await context.reply(buildHelpMessage())
  }
}

export async function handleDiscordDirectMessagePayload(payload: DirectMessageCommandPayload) {
  const parsedCommand = parseDirectMessageCommand(payload.content)

  console.log(
    `Discord DM received from ${payload.authorId}: source=${payload.source}; token=${summarizeDirectMessageToken(payload.content)}; parsed=${parsedCommand?.name ?? 'none'}`
  )

  if (!parsedCommand) {
    return
  }

  await executeDirectMessageCommand(
    {
      authorId: payload.authorId,
      reply: payload.reply
    },
    parsedCommand
  )
}

export async function handleDiscordDirectMessageCommand(message: Message) {
  if (message.author.bot || message.inGuild()) {
    return
  }

  const { content, source } = await resolveDirectMessageContent(message)

  await handleDiscordDirectMessagePayload({
    authorId: message.author.id,
    content,
    source,
    reply: async (replyContent, options) => {
      await replyToDirectMessage(message, replyContent, options)
    }
  })
}

export async function handleDiscordDirectMessageButtonInteraction(interaction: ButtonInteraction) {
  const action = parseDirectMessageCommandButtonAction(interaction.customId)

  if (!action) {
    return false
  }

  if (interaction.user.id !== action.discordUserId) {
    await interaction.reply({
      content: 'This message belongs to another user.',
      allowedMentions: { parse: [] }
    })
    return true
  }

  await interaction.deferUpdate()
  const deleteResult = await deleteDiscordDirectMessage({
    channelId: interaction.channelId,
    messageId: interaction.message.id
  })

  if (deleteResult.status !== 'deleted') {
    await interaction.message.delete().catch(() => {})
  }
  return true
}