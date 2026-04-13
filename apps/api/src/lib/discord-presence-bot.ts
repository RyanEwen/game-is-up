import { ActivityType, Client, Events, GatewayIntentBits, type Presence } from 'discord.js'
import { DiscordActivityType } from '@prisma/client'
import {
  discordPresenceBotState,
  getDiscordBotClient,
  setDiscordBotClient,
  syncDiscordPresenceBotGuildIds
} from './discord-bot-runtime.js'
import { handleDiscordAutoPlayPromptInteraction } from './discord-auto-play-prompts.js'
import { recordDiscordPresence } from './discord-activity.js'
import { env } from './env.js'
import {
  handlePlayIntentNotificationInteraction,
  isPlayIntentNotificationCustomId
} from './play-intent-notification-responses.js'

type DiscordGuildMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type DiscordGuildInviteSendResult = {
  memberId: string;
  username: string;
  displayName: string;
  status: 'sent' | 'failed';
  error: string | null;
};

type DiscordGuildMemberCacheEntry = {
  serverId: string;
  serverName: string;
  members: DiscordGuildMemberSummary[];
  fetchedAt: number;
};
let started = false
const guildMemberCacheTtlMs = 2 * 60 * 1000
const guildMemberCache = new Map<string, DiscordGuildMemberCacheEntry>()
const guildMemberRequests = new Map<string, Promise<DiscordGuildMemberCacheEntry>>()
const guildMemberCooldowns = new Map<string, number>()

function invalidateGuildMemberCache(serverId: string) {
  guildMemberCache.delete(serverId)
}

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/Retry after\s+([\d.]+)\s+seconds/i)

  if (!match) {
    return null
  }

  const retryAfterSeconds = Number(match[1])

  return Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
}

function toDiscordMemberBrowseError(error: unknown, serverId: string): Error {
  const message = error instanceof Error ? error.message : 'Unknown Discord member fetch error.'
  const retryAfterSeconds = parseRetryAfterSeconds(message)

  if (retryAfterSeconds != null) {
    guildMemberCooldowns.set(serverId, Date.now() + retryAfterSeconds * 1000)
    return new Error(`Discord is rate limiting member sync for this server. Try again in about ${Math.ceil(retryAfterSeconds)} seconds.`)
  }

  if (/Missing Access|Unknown Guild|Missing Permissions|Members didn't arrive in time/i.test(message)) {
    return new Error('Discord member browsing needs the bot in this server with Server Members intent enabled.')
  }

  return new Error(`Discord member browsing is unavailable right now. ${message}`)
}

function readGuildMemberCache(serverId: string): DiscordGuildMemberCacheEntry | null {
  const cached = guildMemberCache.get(serverId)

  if (!cached) {
    return null
  }

  if (Date.now() - cached.fetchedAt > guildMemberCacheTtlMs) {
    return null
  }

  return cached
}

function toGuildMemberResponse(entry: DiscordGuildMemberCacheEntry) {
  return {
    serverId: entry.serverId,
    serverName: entry.serverName,
    members: entry.members
  }
}

async function fetchDiscordGuildMembers(serverId: string): Promise<DiscordGuildMemberCacheEntry> {
  const existingRequest = guildMemberRequests.get(serverId)

  if (existingRequest) {
    return existingRequest
  }

  const request = (async () => {
    const client = getDiscordBotClient()
    const guild = client?.guilds.cache.get(serverId) ?? await client?.guilds.fetch(serverId)

    if (!guild) {
      throw new Error('Discord guild not available.')
    }

    const members = await guild.members.fetch()
    const entry: DiscordGuildMemberCacheEntry = {
      serverId: guild.id,
      serverName: guild.name,
      members: [...members.values()]
        .filter((member) => !member.user.bot)
        .map((member) => ({
          id: member.user.id,
          username: member.user.username,
          displayName: member.displayName || member.user.globalName || member.user.username,
          avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 })
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      fetchedAt: Date.now()
    }

    guildMemberCache.set(serverId, entry)
    guildMemberCooldowns.delete(serverId)

    return entry
  })()

  guildMemberRequests.set(serverId, request)

  try {
    return await request
  } finally {
    guildMemberRequests.delete(serverId)
  }
}

function isTrackableDiscordActivity(activity: Presence['activities'][number]) {
  return activity.type === ActivityType.Playing || activity.type === ActivityType.Competing
}

async function handlePresenceUpdate(presence: Presence) {
  const activities = presence.activities
    .filter(isTrackableDiscordActivity)
    .map((activity) => ({
      name: activity.name,
      applicationId: activity.applicationId ?? null,
      activityType: activity.type === ActivityType.Competing ? DiscordActivityType.COMPETING : DiscordActivityType.PLAYING,
      details: activity.details ?? null,
      state: activity.state ?? null,
      startedAt: activity.timestamps?.start ? new Date(activity.timestamps.start) : null,
      rawPayload: {
        name: activity.name,
        applicationId: activity.applicationId ?? null,
        type: activity.type,
        details: activity.details ?? null,
        state: activity.state ?? null,
        startedAt: activity.timestamps?.start ?? null,
        createdAt: activity.createdTimestamp ?? null
      }
    }))

  try {
    await recordDiscordPresence(presence.userId, presence.guild?.id ?? null, activities)
  } catch (error) {
    console.error('Failed to record Discord presence update', error)
  }
}

export async function listDiscordGuildMembers(serverId: string): Promise<{
  serverId: string;
  serverName: string;
  members: DiscordGuildMemberSummary[];
}> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord member browsing needs the bot to be configured.')
  }

  if (!getDiscordBotClient() || !discordPresenceBotState.connected) {
    throw new Error('Discord member browsing is unavailable because the bot is not connected.')
  }

  const freshCache = readGuildMemberCache(serverId)

  if (freshCache) {
    return toGuildMemberResponse(freshCache)
  }

  const cooldownUntil = guildMemberCooldowns.get(serverId)

  if (cooldownUntil && cooldownUntil > Date.now()) {
    const staleCache = guildMemberCache.get(serverId)

    if (staleCache) {
      return toGuildMemberResponse(staleCache)
    }

    throw new Error(`Discord is rate limiting member sync for this server. Try again in about ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds.`)
  }

  try {
    return toGuildMemberResponse(await fetchDiscordGuildMembers(serverId))
  } catch (error) {
    const staleCache = guildMemberCache.get(serverId)

    if (staleCache) {
      return toGuildMemberResponse(staleCache)
    }

    throw toDiscordMemberBrowseError(error, serverId)
  }
}

export async function sendDiscordGuildInvites(options: {
  serverId: string;
  memberIds: string[];
  inviterLabel: string;
  inviteUrl: string;
}): Promise<{
  serverId: string;
  serverName: string;
  results: DiscordGuildInviteSendResult[];
}> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord invite sending needs the bot to be configured.')
  }

  const client = getDiscordBotClient()

  if (!client || !discordPresenceBotState.connected) {
    throw new Error('Discord invite sending is unavailable because the bot is not connected.')
  }

  const { serverId, memberIds, inviterLabel, inviteUrl } = options
  const guild = client.guilds.cache.get(serverId) ?? await client.guilds.fetch(serverId)

  if (!guild) {
    throw new Error('Discord guild not available.')
  }

  const memberList = await listDiscordGuildMembers(serverId)
  const memberById = new Map(memberList.members.map((member) => [member.id, member]))
  const results: DiscordGuildInviteSendResult[] = []
  const inviteMessage = `${inviterLabel} invited you to Game Is Up from ${memberList.serverName}.\n\nJoin here: ${inviteUrl}`

  for (const memberId of [...new Set(memberIds)]) {
    const knownMember = memberById.get(memberId)

    if (!knownMember) {
      results.push({
        memberId,
        username: 'unknown-user',
        displayName: 'Unknown user',
        status: 'failed',
        error: 'This Discord user was not found in the selected server.'
      })
      continue
    }

    try {
      const guildMember = guild.members.cache.get(memberId) ?? await guild.members.fetch(memberId)
      await guildMember.send(inviteMessage)
      results.push({
        memberId,
        username: knownMember.username,
        displayName: knownMember.displayName,
        status: 'sent',
        error: null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send a Discord DM.'
      results.push({
        memberId,
        username: knownMember.username,
        displayName: knownMember.displayName,
        status: 'failed',
        error: /Cannot send messages to this user/i.test(message)
          ? 'This user is not accepting DMs from the bot.'
          : message
      })
    }
  }

  return {
    serverId,
    serverName: memberList.serverName,
    results
  }
}

export async function startDiscordPresenceBot() {
  if (started) {
    return
  }

  started = true

  if (!env.DISCORD_BOT_TOKEN) {
    console.log('Discord presence bot disabled: DISCORD_BOT_TOKEN is not configured.')
    return
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers]
  })
  setDiscordBotClient(client)

  client.once(Events.ClientReady, () => {
    discordPresenceBotState.connected = true
    discordPresenceBotState.userTag = client.user?.tag ?? null
    discordPresenceBotState.lastReadyAt = new Date().toISOString()
    discordPresenceBotState.lastError = null
    syncDiscordPresenceBotGuildIds()
    console.log(`Discord presence bot connected as ${discordPresenceBotState.userTag ?? 'unknown-user'} across ${discordPresenceBotState.guildIds.length} guild(s).`)
  })

  client.on('presenceUpdate', (_oldPresence, newPresence) => {
    void handlePresenceUpdate(newPresence)
  })

  client.on('guildCreate', () => {
    syncDiscordPresenceBotGuildIds()
  })

  client.on('guildDelete', (guild) => {
    syncDiscordPresenceBotGuildIds()
    invalidateGuildMemberCache(guild.id)
  })

  client.on(Events.GuildMemberAdd, (member) => {
    invalidateGuildMemberCache(member.guild.id)
  })

  client.on(Events.GuildMemberRemove, (member) => {
    invalidateGuildMemberCache(member.guild.id)
  })

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton()) {
      return
    }

    if (interaction.customId.startsWith('auto-play:')) {
      void handleDiscordAutoPlayPromptInteraction(interaction)
      return
    }

    if (isPlayIntentNotificationCustomId(interaction.customId)) {
      void handlePlayIntentNotificationInteraction(interaction)
    }
  })

  client.on('shardDisconnect', () => {
    discordPresenceBotState.connected = false
  })

  client.on('error', (error) => {
    discordPresenceBotState.lastError = error.message
    console.error('Discord presence bot error', error)
  })

  try {
    await client.login(env.DISCORD_BOT_TOKEN)
  } catch (error) {
    discordPresenceBotState.connected = false
    discordPresenceBotState.lastError = error instanceof Error ? error.message : 'Unknown Discord bot login error'
    console.error('Discord presence bot failed to start', error)
  }
}