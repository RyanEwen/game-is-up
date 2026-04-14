import { ActivityType, Client, Events, GatewayIntentBits, type Presence } from 'discord.js'
import { DiscordActivityType } from '@prisma/client'
import {
  discordPresenceBotState,
  getDiscordBotMode,
  getDiscordBotClient,
  isDiscordBotGatewayMode,
  sendDiscordDirectMessages,
  setDiscordBotClient,
  syncDiscordPresenceBotGuildIds
} from './discord-bot-runtime.js'
import { handleDiscordAutoPlayPromptInteraction } from './discord-auto-play-prompts.js'
import { recordDiscordPresence } from './discord-activity.js'
import { env } from './env.js'
import {
  handleScheduledPlayIntentCheckInInteraction,
  handlePlayIntentNotificationInteraction,
  isScheduledPlayIntentCheckInCustomId,
  isPlayIntentNotificationCustomId
} from './play-intent-notification-responses.js'

type DiscordGuildMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  profileDisplayName: string;
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

type DiscordGuildAccessCacheEntry = {
  serverId: string;
  serverName: string | null;
  present: boolean;
  fetchedAt: number;
};

type DiscordRestGuildSummary = {
  id: string;
  name: string;
};

type DiscordRestUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
};

type DiscordRestGuildMember = {
  user?: DiscordRestUser;
  nick?: string | null;
  avatar?: string | null;
};

let started = false
const discordApiBaseUrl = 'https://discord.com/api/v10'
const guildMemberCacheTtlMs = 2 * 60 * 1000
const guildAccessCacheTtlMs = 2 * 60 * 1000
const guildMemberCache = new Map<string, DiscordGuildMemberCacheEntry>()
const guildMemberRequests = new Map<string, Promise<DiscordGuildMemberCacheEntry>>()
const guildAccessCache = new Map<string, DiscordGuildAccessCacheEntry>()
const guildAccessRequests = new Map<string, Promise<DiscordGuildAccessCacheEntry>>()
const guildMemberCooldowns = new Map<string, number>()

function invalidateGuildMemberCache(serverId: string) {
  guildMemberCache.delete(serverId)
}

function invalidateGuildAccessCache(serverId: string) {
  guildAccessCache.delete(serverId)
}

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/Retry after\s+([\d.]+)\s+seconds/i)
    ?? message.match(/"retry_after"\s*:\s*([\d.]+)/i)

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

function readGuildAccessCache(serverId: string): DiscordGuildAccessCacheEntry | null {
  const cached = guildAccessCache.get(serverId)

  if (!cached) {
    return null
  }

  if (Date.now() - cached.fetchedAt > guildAccessCacheTtlMs) {
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

function buildDiscordQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value)
    }
  }

  return query.toString()
}

async function fetchDiscordJson<T>(path: string): Promise<T> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord bot token is not configured.')
  }

  const response = await fetch(`${discordApiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body ? `Discord API ${response.status}: ${body}` : `Discord API ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

function buildDiscordUserAvatarUrl(userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
}

function buildDiscordGuildMemberAvatarUrl(serverId: string, userId: string, avatarHash: string | null, fallbackAvatarUrl: string | null): string | null {
  if (avatarHash) {
    return `https://cdn.discordapp.com/guilds/${serverId}/users/${userId}/avatars/${avatarHash}.png?size=128`
  }

  return fallbackAvatarUrl
}

async function fetchDiscordGuildSummaryViaRest(serverId: string): Promise<DiscordRestGuildSummary> {
  return fetchDiscordJson<DiscordRestGuildSummary>(`/guilds/${serverId}`)
}

async function fetchDiscordGuildMembersViaRest(serverId: string): Promise<DiscordGuildMemberCacheEntry> {
  const guild = await fetchDiscordGuildSummaryViaRest(serverId)
  const members: DiscordGuildMemberSummary[] = []
  let after: string | undefined

  while (true) {
    const query = buildDiscordQuery({
      limit: '1000',
      after
    })
    const batch = await fetchDiscordJson<DiscordRestGuildMember[]>(`/guilds/${serverId}/members${query ? `?${query}` : ''}`)

    if (batch.length === 0) {
      break
    }

    for (const member of batch) {
      if (!member.user || member.user.bot) {
        continue
      }

      const profileDisplayName = member.user.global_name?.trim() || member.user.username
      const userAvatarUrl = buildDiscordUserAvatarUrl(member.user.id, member.user.avatar ?? null)

      members.push({
        id: member.user.id,
        username: member.user.username,
        displayName: member.nick?.trim() || profileDisplayName,
        profileDisplayName,
        avatarUrl: buildDiscordGuildMemberAvatarUrl(serverId, member.user.id, member.avatar ?? null, userAvatarUrl)
      })
    }

    if (batch.length < 1000) {
      break
    }

    after = batch.at(-1)?.user?.id

    if (!after) {
      break
    }
  }

  const entry: DiscordGuildMemberCacheEntry = {
    serverId: guild.id,
    serverName: guild.name,
    members: members.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    fetchedAt: Date.now()
  }

  guildMemberCache.set(serverId, entry)
  guildAccessCache.set(serverId, {
    serverId: guild.id,
    serverName: guild.name,
    present: true,
    fetchedAt: entry.fetchedAt
  })
  guildMemberCooldowns.delete(serverId)

  return entry
}

async function fetchDiscordGuildAccess(serverId: string): Promise<DiscordGuildAccessCacheEntry> {
  const existingRequest = guildAccessRequests.get(serverId)

  if (existingRequest) {
    return existingRequest
  }

  const request = (async () => {
    try {
      if (isDiscordBotGatewayMode()) {
        const client = getDiscordBotClient()
        const guild = client?.guilds.cache.get(serverId) ?? await client?.guilds.fetch(serverId)

        if (!guild) {
          throw new Error('Discord guild not available.')
        }

        const entry: DiscordGuildAccessCacheEntry = {
          serverId: guild.id,
          serverName: guild.name,
          present: true,
          fetchedAt: Date.now()
        }

        guildAccessCache.set(serverId, entry)
        return entry
      }

      const guild = await fetchDiscordGuildSummaryViaRest(serverId)
      const entry: DiscordGuildAccessCacheEntry = {
        serverId: guild.id,
        serverName: guild.name,
        present: true,
        fetchedAt: Date.now()
      }

      guildAccessCache.set(serverId, entry)
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Discord guild access error.'

      if (/Missing Access|Unknown Guild|Missing Permissions/i.test(message)) {
        const entry: DiscordGuildAccessCacheEntry = {
          serverId,
          serverName: null,
          present: false,
          fetchedAt: Date.now()
        }

        guildAccessCache.set(serverId, entry)
        return entry
      }

      throw error
    }
  })()

  guildAccessRequests.set(serverId, request)

  try {
    return await request
  } finally {
    guildAccessRequests.delete(serverId)
  }
}

async function fetchDiscordGuildMembers(serverId: string): Promise<DiscordGuildMemberCacheEntry> {
  const existingRequest = guildMemberRequests.get(serverId)

  if (existingRequest) {
    return existingRequest
  }

  const request = (async () => {
    if (!isDiscordBotGatewayMode()) {
      return fetchDiscordGuildMembersViaRest(serverId)
    }

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
        .map((member) => {
          const profileDisplayName = member.user.globalName || member.user.username

          return {
            id: member.user.id,
            username: member.user.username,
            displayName: member.displayName || profileDisplayName,
            profileDisplayName,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 })
          }
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      fetchedAt: Date.now()
    }

    guildMemberCache.set(serverId, entry)
    guildAccessCache.set(serverId, {
      serverId: guild.id,
      serverName: guild.name,
      present: true,
      fetchedAt: entry.fetchedAt
    })
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

export async function isDiscordBotPresentInGuild(serverId: string): Promise<boolean> {
  if (!env.DISCORD_BOT_TOKEN) {
    return false
  }

  const freshCache = readGuildAccessCache(serverId)

  if (freshCache) {
    return freshCache.present
  }

  return (await fetchDiscordGuildAccess(serverId)).present
}

export async function getDiscordBotPresentServerIds(serverIds: string[]): Promise<Set<string>> {
  const presentIds = await Promise.all(
    [...new Set(serverIds)].map(async (serverId) => ({
      serverId,
      present: await isDiscordBotPresentInGuild(serverId)
    }))
  )

  return new Set(presentIds.filter((entry) => entry.present).map((entry) => entry.serverId))
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

  if (isDiscordBotGatewayMode() && (!getDiscordBotClient() || !discordPresenceBotState.connected)) {
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

  const { serverId, memberIds, inviterLabel, inviteUrl } = options
  const memberList = await listDiscordGuildMembers(serverId)
  const memberById = new Map(memberList.members.map((member) => [member.id, member]))
  const results: DiscordGuildInviteSendResult[] = []
  const inviteMessage = `${inviterLabel} invited you to Game's Up from ${memberList.serverName}.\n\nJoin here: ${inviteUrl}`
  const inviteTargets = [...new Set(memberIds)]
    .map((memberId) => {
      const knownMember = memberById.get(memberId)

      if (!knownMember) {
        results.push({
          memberId,
          username: 'unknown-user',
          displayName: 'Unknown user',
          status: 'failed',
          error: 'This Discord user was not found in the selected server.'
        })

        return null
      }

      return {
        memberId,
        knownMember,
        payload: {
          discordUserId: memberId,
          content: inviteMessage
        }
      }
    })
    .filter((entry): entry is {
      memberId: string;
      knownMember: DiscordGuildMemberSummary;
      payload: {
        discordUserId: string;
        content: string;
      };
    } => entry != null)

  const dmResults = await sendDiscordDirectMessages(inviteTargets.map((entry) => entry.payload))
  const dmResultByUserId = new Map(dmResults.map((result) => [result.discordUserId, result]))

  for (const target of inviteTargets) {
    const dmResult = dmResultByUserId.get(target.memberId)

    results.push({
      memberId: target.memberId,
      username: target.knownMember.username,
      displayName: target.knownMember.displayName,
      status: dmResult?.status === 'sent' ? 'sent' : 'failed',
      error: dmResult?.status === 'sent' ? null : (dmResult?.error ?? 'Unable to send a Discord DM.')
    })
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

  if (!isDiscordBotGatewayMode()) {
    console.log(`Discord presence bot gateway disabled: DISCORD_BOT_MODE=${getDiscordBotMode()}. REST-only Discord browsing and DM features remain available.`)
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
    invalidateGuildAccessCache(guild.id)
    invalidateGuildMemberCache(guild.id)
  })

  client.on(Events.GuildMemberAdd, (member) => {
    invalidateGuildAccessCache(member.guild.id)
    invalidateGuildMemberCache(member.guild.id)
  })

  client.on(Events.GuildMemberRemove, (member) => {
    invalidateGuildAccessCache(member.guild.id)
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
      return
    }

    if (isScheduledPlayIntentCheckInCustomId(interaction.customId)) {
      void handleScheduledPlayIntentCheckInInteraction(interaction)
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
