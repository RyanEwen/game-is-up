import {
  ActionRowBuilder,
  type Message,
  type MessageActionRowComponentBuilder
} from 'discord.js'
import { AuthProvider } from '@prisma/client'
import { buildOpenInAppButton, buildDiscordMessageHeading } from './discord-dm-formatting.js'
import { deleteSettledDiscordDirectMessagesForUser } from './discord-dm-cleanup.js'
import { env } from './env.js'
import { clearCurrentPlayIntent, getCurrentPlayIntent } from './play-intents.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'

type DirectMessageCommandName = 'help' | 'status' | 'cancel' | 'autoplay' | 'cleanup'

type ParsedDirectMessageCommand = {
  name: DirectMessageCommandName;
  args: string[];
} | {
  name: 'unknown';
  args: string[];
}

const directMessageCommandAliases = new Map<string, DirectMessageCommandName>([
  ['help', 'help'],
  ['commands', 'help'],
  ['menu', 'help'],
  ['status', 'status'],
  ['state', 'status'],
  ['cancel', 'cancel'],
  ['stop', 'cancel'],
  ['autoplay', 'autoplay'],
  ['auto-play', 'autoplay'],
  ['autoprompt', 'autoplay'],
  ['auto-prompt', 'autoplay'],
  ['cleanup', 'cleanup'],
  ['clean', 'cleanup']
])

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
        ? activeIntent.targetServers.map((server) => server.name).join(', ')
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

async function replyToDirectMessage(message: Message, content: string) {
  await message.reply({
    content,
    components: [buildOpenAppRow()]
  })
}

async function replyWithLinkPrompt(message: Message) {
  await replyToDirectMessage(
    message,
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
    '- `status` shows your active call to play and auto-play prompt setting.',
    '- `cancel` closes your current call to play.',
    '- `autoplay` shows whether Discord auto-play prompts are on.',
    '- `autoplay on` enables Discord auto-play prompts.',
    '- `autoplay off` disables Discord auto-play prompts.',
    '- `cleanup` removes ended bot messages and settled prompts.'
  ].join('\n\n')
}

async function handleStatusCommand(message: Message, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const activeIntent = await getCurrentPlayIntent(identity.userId)

  if (!activeIntent) {
    await replyToDirectMessage(
      message,
      [
        buildDiscordMessageHeading('Current status'),
        'Call to play: None active.',
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

  await replyToDirectMessage(
    message,
    [
      buildDiscordMessageHeading('Current status'),
      `Call to play: ${activeIntent.title}`,
      `Games: ${summarizeGames(activeIntent.games, activeIntent.selectionMode)}`,
      `When: ${whenLabel}`,
      `Audience: ${describeNotifyScope(activeIntent)}`,
      `Interest: ${interestedSummary}`,
      `Auto-play prompts: ${identity.user.discordAutoPromptPlayIntent ? 'On' : 'Off'}.`,
      activeIntent.note.trim().length > 0 ? `Note: ${activeIntent.note.trim()}` : null
    ].filter((part): part is string => Boolean(part)).join('\n\n')
  )
}

async function handleCancelCommand(message: Message, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const activeIntent = await getCurrentPlayIntent(identity.userId)

  if (!activeIntent) {
    await replyToDirectMessage(
      message,
      [
        buildDiscordMessageHeading('No active call to play'),
        'There is nothing active to cancel right now.'
      ].join('\n\n')
    )
    return
  }

  await clearCurrentPlayIntent(identity.userId)

  await replyToDirectMessage(
    message,
    [
      buildDiscordMessageHeading('Call to play canceled'),
      `Closed: ${activeIntent.title}`,
      'Anyone who already received the call to play will see that it ended.'
    ].join('\n\n')
  )
}

async function handleAutoplayCommand(
  message: Message,
  identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>,
  args: string[]
) {
  const requestedState = args[0]

  if (!requestedState) {
    await replyToDirectMessage(
      message,
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
    await replyToDirectMessage(
      message,
      [
        buildDiscordMessageHeading('Auto-play prompts'),
        'Use `autoplay`, `autoplay on`, or `autoplay off`.'
      ].join('\n\n')
    )
    return
  }

  if (identity.user.discordAutoPromptPlayIntent === nextValue) {
    await replyToDirectMessage(
      message,
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

  await replyToDirectMessage(
    message,
    [
      buildDiscordMessageHeading('Auto-play prompts updated'),
      `Discord auto-play prompts are now ${nextValue ? 'on' : 'off'}.`
    ].join('\n\n')
  )
}

async function handleCleanupCommand(message: Message, identity: NonNullable<Awaited<ReturnType<typeof resolveDiscordIdentity>>>) {
  const result = await deleteSettledDiscordDirectMessagesForUser(identity.userId)

  if (result.attemptedCount === 0) {
    await replyToDirectMessage(
      message,
      [
        buildDiscordMessageHeading('Nothing to clean up'),
        'There are no ended bot messages or settled prompts to remove right now.'
      ].join('\n\n')
    )
    return
  }

  const summary = result.deletedCount === result.attemptedCount
    ? `Removed ${result.deletedCount} tracked Discord message${result.deletedCount === 1 ? '' : 's'}.`
    : `Removed ${result.deletedCount} of ${result.attemptedCount} tracked Discord messages.`

  await replyToDirectMessage(
    message,
    [
      buildDiscordMessageHeading('Cleanup complete'),
      summary
    ].join('\n\n')
  )
}

export async function handleDiscordDirectMessageCommand(message: Message) {
  if (message.author.bot || message.inGuild()) {
    return
  }

  const parsedCommand = parseDirectMessageCommand(message.content)

  if (!parsedCommand) {
    return
  }

  if (parsedCommand.name === 'help') {
    await replyToDirectMessage(message, buildHelpMessage())
    return
  }

  if (parsedCommand.name === 'unknown') {
    await replyToDirectMessage(
      message,
      [
        buildDiscordMessageHeading('Unknown command'),
        'Use `help` to see the available DM commands.'
      ].join('\n\n')
    )
    return
  }

  const identity = await resolveDiscordIdentity(message.author.id)

  if (!identity) {
    await replyWithLinkPrompt(message)
    return
  }

  switch (parsedCommand.name) {
    case 'status':
      await handleStatusCommand(message, identity)
      return
    case 'cancel':
      await handleCancelCommand(message, identity)
      return
    case 'autoplay':
      await handleAutoplayCommand(message, identity, parsedCommand.args)
      return
    case 'cleanup':
      await handleCleanupCommand(message, identity)
      return
    default:
      await replyToDirectMessage(message, buildHelpMessage())
  }
}