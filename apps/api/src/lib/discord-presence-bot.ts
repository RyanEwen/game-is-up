/**
 * Long-lived Discord gateway client that backs presence observations,
 * interactive button/select/slash dispatch, and DM message-delivery commands.
 *
 * The repository deliberately runs at most one gateway-mode instance per bot
 * token; other environments share the token in REST-only mode (see
 * `discord-bot-runtime.ts`). This module owns connect/reconnect, listener
 * registration, member-cache hydration, and routing inbound interactions to
 * the per-feature handlers (slash commands, DM commands, prompt buttons,
 * recipient response buttons, creator action buttons, and the call-to-play
 * composer's buttons/selects/modals).
 */
import {
  handleAccountHubInteraction,
  isAccountHubCustomId,
} from './discord-account-hub.js'
import {
  handlePlayIntentFriendInviteInteraction,
  playIntentFriendInvitePrefix,
} from './discord-play-intent-friend-invites.js'
import { MessageFlags } from 'discord.js'
import { composerDraftId } from './discord-ctp-composer-policy.js'
import { runDiscordMessageAction } from './discord-action-lifecycle.js'
import { ctpComposerInteractionOpensModal } from './discord-ctp-composer.js'
import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayDispatchEvents,
  GatewayIntentBits,
  Partials,
  type GatewayMessageCreateDispatchData,
  type MessageActionRowComponentBuilder,
  type Presence,
  type VoiceState,
} from 'discord.js'
import { DiscordActivityType } from '@prisma/client'
import {
  discordPresenceBotState,
  deleteDiscordDirectMessage,
  getDiscordBotMode,
  getDiscordBotClient,
  isDiscordBotGatewayMode,
  sendDiscordDirectMessages,
  setDiscordBotClient,
  syncDiscordPresenceBotGuildIds,
} from './discord-bot-runtime.js'
import { handleDiscordAutoPlayPromptInteraction } from './discord-auto-play-prompts.js'
import {
  handleCtpComposerButtonInteraction,
  handleCtpComposerModalSubmit,
  handleCtpComposerSelectInteraction,
  isCtpComposerCustomId,
} from './discord-ctp-composer.js'
import { recordDiscordPresence } from './discord-activity.js'
import { env } from './env.js'
import { prisma } from './prisma.js'
import {
  handleCreatorPlayIntentSummaryInteraction,
  handleScheduledPlayIntentCheckInInteraction,
  handlePlayIntentNotificationInteraction,
  isCreatorPlayIntentSummaryCustomId,
  isScheduledPlayIntentCheckInCustomId,
  isPlayIntentNotificationCustomId,
} from './play-intent-notification-responses.js'
import {
  handleRunningLateModalSubmit,
  isRunningLateModalCustomId,
} from './discord-running-late-response.js'
import {
  buildDirectMessageReplyPayload,
  type DirectMessageReplyOptions,
  handleDiscordDirectMessageButtonInteraction,
  handleDiscordDirectMessageCommand,
  handleDiscordDirectMessagePayload,
} from './discord-direct-message-commands.js'
import {
  handlePlayIntentDiscordSpaceMemberJoin,
  markPlayIntentDiscordSpaceChannelActivity,
} from './play-intent-discord-spaces.js'
import {
  handleDiscordSlashCommand,
  registerDiscordSlashCommands,
} from './discord-slash-commands.js'
import { maybeSendPlayIntentVoiceChannelJoinNotifications } from './play-intent-launch-notifications.js'

type DiscordGuildMemberSummary = {
  id: string
  username: string
  displayName: string
  profileDisplayName: string
  avatarUrl: string | null
}

type DiscordGuildInviteSendResult = {
  memberId: string
  username: string
  displayName: string
  status: 'sent' | 'failed'
  error: string | null
}

type DiscordGuildMemberCacheEntry = {
  serverId: string
  serverName: string
  members: DiscordGuildMemberSummary[]
  fetchedAt: number
}

type DiscordGuildAccessCacheEntry = {
  serverId: string
  serverName: string | null
  present: boolean
  fetchedAt: number
}

type DiscordRestGuildSummary = {
  id: string
  name: string
}

function scheduleGatewayDirectMessageDeletion(
  channelId: string,
  messageId: string,
  delayMs: number,
) {
  const timeout = setTimeout(() => {
    void deleteDiscordDirectMessage({
      channelId,
      messageId,
    })
  }, delayMs)

  timeout.unref?.()
}

type DiscordRestUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  bot?: boolean
}

type DiscordRestGuildMember = {
  user?: DiscordRestUser
  nick?: string | null
  avatar?: string | null
}

let started = false
const discordApiBaseUrl = 'https://discord.com/api/v10'
const discordSnowflakePattern = /^\d{17,20}$/
const guildMemberCacheTtlMs = 2 * 60 * 1000
const guildAccessCacheTtlMs = 2 * 60 * 1000
const guildMemberCache = new Map<string, DiscordGuildMemberCacheEntry>()
const guildMemberRequests = new Map<
  string,
  Promise<DiscordGuildMemberCacheEntry>
>()
const guildAccessCache = new Map<string, DiscordGuildAccessCacheEntry>()
const guildAccessRequests = new Map<
  string,
  Promise<DiscordGuildAccessCacheEntry>
>()
const guildMemberCooldowns = new Map<string, number>()
const discordDirectMessageDedupeWindowMs = 5 * 60 * 1000
const handledDiscordDirectMessageIds = new Map<string, NodeJS.Timeout>()

function claimDiscordDirectMessage(messageId: string) {
  const existingTimeout = handledDiscordDirectMessageIds.get(messageId)

  if (existingTimeout) {
    return false
  }

  const timeout = setTimeout(() => {
    handledDiscordDirectMessageIds.delete(messageId)
  }, discordDirectMessageDedupeWindowMs)

  handledDiscordDirectMessageIds.set(messageId, timeout)
  return true
}

function releaseDiscordDirectMessage(messageId: string) {
  const existingTimeout = handledDiscordDirectMessageIds.get(messageId)

  if (!existingTimeout) {
    return
  }

  clearTimeout(existingTimeout)
  handledDiscordDirectMessageIds.delete(messageId)
}

function isDiscordSnowflake(value: string) {
  return discordSnowflakePattern.test(value)
}

function buildInviteLandingUrl(options: {
  serverId?: string | null
  serverName: string
  inviterDiscordUserId?: string | null
  inviterLabel?: string | null
  memberCount?: number | null
  kind?: 'direct' | 'server'
  fallbackUrl?: string | null
}) {
  try {
    const inviteUrl = new URL('/invite', env.CLIENT_ORIGIN)

    if (options.serverId?.trim()) {
      inviteUrl.searchParams.set('serverId', options.serverId.trim())
    }

    inviteUrl.searchParams.set('server', options.serverName)

    if (options.inviterDiscordUserId?.trim()) {
      inviteUrl.searchParams.set(
        'inviterDiscordId',
        options.inviterDiscordUserId.trim(),
      )
    }

    if (options.inviterLabel?.trim()) {
      inviteUrl.searchParams.set('inviter', options.inviterLabel.trim())
    }

    if (options.memberCount != null && Number.isFinite(options.memberCount)) {
      inviteUrl.searchParams.set(
        'members',
        String(Math.max(0, Math.floor(options.memberCount))),
      )
    }

    inviteUrl.searchParams.set('kind', options.kind ?? 'direct')
    return inviteUrl.toString()
  } catch {
    return options.fallbackUrl ?? env.CLIENT_ORIGIN
  }
}

function buildDiscordInviteComponents(inviteUrl: string) {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open Invite')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl),
    ),
  ]
}

function buildDiscordInviteEmbeds(options: {
  serverName: string
  inviterLabel: string
  inviteUrl: string
  appMemberCount: number
}) {
  const reachLabel =
    options.appMemberCount > 0
      ? `${options.appMemberCount} ${options.appMemberCount === 1 ? 'person from this server already uses' : 'people from this server already use'} Game's Up.`
      : "Be the first person from this server on Game's Up."

  return [
    new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`Join Game's Up through ${options.serverName}`)
      .setDescription(
        [
          `${options.inviterLabel} invited you to join Game's Up.`,
          reachLabel,
          'Open the invite to sign in with Discord, compare libraries, and jump into calls to play.',
        ].join('\n\n'),
      )
      .addFields(
        {
          name: 'Server',
          value: options.serverName,
          inline: true,
        },
        {
          name: 'Already around',
          value:
            options.appMemberCount > 0
              ? String(options.appMemberCount)
              : 'Be the first',
          inline: true,
        },
        {
          name: 'Invite link',
          value: options.inviteUrl,
          inline: false,
        },
      )
      .setFooter({
        text: "Game's Up works best when your Discord group is already there.",
      }),
  ]
}

function invalidateGuildMemberCache(serverId: string) {
  guildMemberCache.delete(serverId)
}

function invalidateGuildAccessCache(serverId: string) {
  guildAccessCache.delete(serverId)
}

function isDevelopmentSyntheticDiscordId(value: string) {
  return env.NODE_ENV !== 'production' && !isDiscordSnowflake(value)
}

function buildInvalidGuildAccessEntry(
  serverId: string,
): DiscordGuildAccessCacheEntry {
  return {
    serverId,
    serverName: null,
    present: isDevelopmentSyntheticDiscordId(serverId),
    fetchedAt: Date.now(),
  }
}

function assertLiveDiscordGuildId(
  serverId: string,
  operation: 'member browsing' | 'voice channel browsing',
) {
  if (isDiscordSnowflake(serverId)) {
    return
  }

  if (isDevelopmentSyntheticDiscordId(serverId)) {
    throw new Error(
      `Synthetic development Discord servers do not support live ${operation}.`,
    )
  }

  throw new Error('Discord guild ids must be snowflakes.')
}

function parseRetryAfterSeconds(message: string): number | null {
  const match =
    message.match(/Retry after\s+([\d.]+)\s+seconds/i) ??
    message.match(/"retry_after"\s*:\s*([\d.]+)/i)

  if (!match) {
    return null
  }

  const retryAfterSeconds = Number(match[1])

  return Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
}

function toDiscordMemberBrowseError(error: unknown, serverId: string): Error {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown Discord member fetch error.'
  const retryAfterSeconds = parseRetryAfterSeconds(message)

  if (retryAfterSeconds != null) {
    guildMemberCooldowns.set(serverId, Date.now() + retryAfterSeconds * 1000)
    return new Error(
      `Discord is rate limiting member sync for this server. Try again in about ${Math.ceil(retryAfterSeconds)} seconds.`,
    )
  }

  if (
    /Missing Access|Unknown Guild|Missing Permissions|Members didn't arrive in time/i.test(
      message,
    )
  ) {
    return new Error(
      'Discord member browsing needs the bot in this server with Server Members intent enabled.',
    )
  }

  return new Error(
    `Discord member browsing is unavailable right now. ${message}`,
  )
}

function readGuildMemberCache(
  serverId: string,
): DiscordGuildMemberCacheEntry | null {
  const cached = guildMemberCache.get(serverId)

  if (!cached) {
    return null
  }

  if (Date.now() - cached.fetchedAt > guildMemberCacheTtlMs) {
    return null
  }

  return cached
}

function readGuildAccessCache(
  serverId: string,
): DiscordGuildAccessCacheEntry | null {
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
    members: entry.members,
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
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      body
        ? `Discord API ${response.status}: ${body}`
        : `Discord API ${response.status} ${response.statusText}`,
    )
  }

  return response.json() as Promise<T>
}

function buildDiscordUserAvatarUrl(
  userId: string,
  avatarHash: string | null,
): string | null {
  if (!avatarHash) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
}

function buildDiscordGuildMemberAvatarUrl(
  serverId: string,
  userId: string,
  avatarHash: string | null,
  fallbackAvatarUrl: string | null,
): string | null {
  if (avatarHash) {
    return `https://cdn.discordapp.com/guilds/${serverId}/users/${userId}/avatars/${avatarHash}.png?size=128`
  }

  return fallbackAvatarUrl
}

async function fetchDiscordGuildSummaryViaRest(
  serverId: string,
): Promise<DiscordRestGuildSummary> {
  return fetchDiscordJson<DiscordRestGuildSummary>(`/guilds/${serverId}`)
}

async function fetchDiscordGuildMembersViaRest(
  serverId: string,
): Promise<DiscordGuildMemberCacheEntry> {
  assertLiveDiscordGuildId(serverId, 'member browsing')
  const guild = await fetchDiscordGuildSummaryViaRest(serverId)
  const members: DiscordGuildMemberSummary[] = []
  let after: string | undefined

  while (true) {
    const query = buildDiscordQuery({
      limit: '1000',
      after,
    })
    const batch = await fetchDiscordJson<DiscordRestGuildMember[]>(
      `/guilds/${serverId}/members${query ? `?${query}` : ''}`,
    )

    if (batch.length === 0) {
      break
    }

    for (const member of batch) {
      if (!member.user || member.user.bot) {
        continue
      }

      const profileDisplayName =
        member.user.global_name?.trim() || member.user.username
      const userAvatarUrl = buildDiscordUserAvatarUrl(
        member.user.id,
        member.user.avatar ?? null,
      )

      members.push({
        id: member.user.id,
        username: member.user.username,
        displayName: member.nick?.trim() || profileDisplayName,
        profileDisplayName,
        avatarUrl: buildDiscordGuildMemberAvatarUrl(
          serverId,
          member.user.id,
          member.avatar ?? null,
          userAvatarUrl,
        ),
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
    members: members.sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    ),
    fetchedAt: Date.now(),
  }

  guildMemberCache.set(serverId, entry)
  guildAccessCache.set(serverId, {
    serverId: guild.id,
    serverName: guild.name,
    present: true,
    fetchedAt: entry.fetchedAt,
  })
  guildMemberCooldowns.delete(serverId)

  return entry
}

async function fetchDiscordGuildAccess(
  serverId: string,
): Promise<DiscordGuildAccessCacheEntry> {
  const existingRequest = guildAccessRequests.get(serverId)

  if (existingRequest) {
    return existingRequest
  }

  if (!isDiscordSnowflake(serverId)) {
    const entry = buildInvalidGuildAccessEntry(serverId)
    guildAccessCache.set(serverId, entry)
    return entry
  }

  const request = (async () => {
    try {
      if (isDiscordBotGatewayMode()) {
        const client = getDiscordBotClient()
        const guild =
          client?.guilds.cache.get(serverId) ??
          (await client?.guilds.fetch(serverId))

        if (!guild) {
          throw new Error('Discord guild not available.')
        }

        const entry: DiscordGuildAccessCacheEntry = {
          serverId: guild.id,
          serverName: guild.name,
          present: true,
          fetchedAt: Date.now(),
        }

        guildAccessCache.set(serverId, entry)
        return entry
      }

      const guild = await fetchDiscordGuildSummaryViaRest(serverId)
      const entry: DiscordGuildAccessCacheEntry = {
        serverId: guild.id,
        serverName: guild.name,
        present: true,
        fetchedAt: Date.now(),
      }

      guildAccessCache.set(serverId, entry)
      return entry
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Discord guild access error.'

      if (/Missing Access|Unknown Guild|Missing Permissions/i.test(message)) {
        const entry: DiscordGuildAccessCacheEntry = {
          serverId,
          serverName: null,
          present: false,
          fetchedAt: Date.now(),
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

async function fetchDiscordGuildMembers(
  serverId: string,
): Promise<DiscordGuildMemberCacheEntry> {
  const existingRequest = guildMemberRequests.get(serverId)

  if (existingRequest) {
    return existingRequest
  }

  const request = (async () => {
    if (!isDiscordBotGatewayMode()) {
      return fetchDiscordGuildMembersViaRest(serverId)
    }

    const client = getDiscordBotClient()
    const guild =
      client?.guilds.cache.get(serverId) ??
      (await client?.guilds.fetch(serverId))

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
          const profileDisplayName =
            member.user.globalName || member.user.username

          return {
            id: member.user.id,
            username: member.user.username,
            displayName: member.displayName || profileDisplayName,
            profileDisplayName,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128 }),
          }
        })
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
      fetchedAt: Date.now(),
    }

    guildMemberCache.set(serverId, entry)
    guildAccessCache.set(serverId, {
      serverId: guild.id,
      serverName: guild.name,
      present: true,
      fetchedAt: entry.fetchedAt,
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

export async function isDiscordBotPresentInGuild(
  serverId: string,
): Promise<boolean> {
  if (!isDiscordSnowflake(serverId)) {
    const entry = buildInvalidGuildAccessEntry(serverId)
    guildAccessCache.set(serverId, entry)
    return entry.present
  }

  if (!env.DISCORD_BOT_TOKEN) {
    return false
  }

  const freshCache = readGuildAccessCache(serverId)

  if (freshCache) {
    return freshCache.present
  }

  return (await fetchDiscordGuildAccess(serverId)).present
}

export async function getDiscordBotPresentServerIds(
  serverIds: string[],
): Promise<Set<string>> {
  const presentIds = await Promise.all(
    [...new Set(serverIds)].map(async (serverId) => ({
      serverId,
      present: await isDiscordBotPresentInGuild(serverId),
    })),
  )

  return new Set(
    presentIds.filter((entry) => entry.present).map((entry) => entry.serverId),
  )
}

function isTrackableDiscordActivity(activity: Presence['activities'][number]) {
  return (
    activity.type === ActivityType.Playing ||
    activity.type === ActivityType.Competing
  )
}

async function handlePresenceUpdate(presence: Presence) {
  const activities = presence.activities
    .filter(isTrackableDiscordActivity)
    .map((activity) => ({
      name: activity.name,
      applicationId: activity.applicationId ?? null,
      activityType:
        activity.type === ActivityType.Competing
          ? DiscordActivityType.COMPETING
          : DiscordActivityType.PLAYING,
      details: activity.details ?? null,
      state: activity.state ?? null,
      startedAt: activity.timestamps?.start
        ? new Date(activity.timestamps.start)
        : null,
      rawPayload: {
        name: activity.name,
        applicationId: activity.applicationId ?? null,
        type: activity.type,
        details: activity.details ?? null,
        state: activity.state ?? null,
        startedAt: activity.timestamps?.start ?? null,
        createdAt: activity.createdTimestamp ?? null,
      },
    }))

  try {
    await recordDiscordPresence(
      presence.userId,
      presence.guild?.id ?? null,
      activities,
    )
  } catch (error) {
    console.error('Failed to record Discord presence update', error)
  }
}

async function handleVoiceStateUpdate(
  previousState: VoiceState,
  nextState: VoiceState,
) {
  if (
    previousState.channelId === nextState.channelId ||
    nextState.member?.user.bot ||
    previousState.member?.user.bot
  ) {
    return
  }

  try {
    await markPlayIntentDiscordSpaceChannelActivity([
      previousState.channelId ?? '',
      nextState.channelId ?? '',
    ])

    if (!nextState.channelId) {
      return
    }

    await maybeSendPlayIntentVoiceChannelJoinNotifications({
      discordUserId: nextState.id,
      channelId: nextState.channelId,
      channelName: nextState.channel?.name ?? null,
    })
  } catch (error) {
    console.error('Failed to record Discord voice channel join update', error)
  }
}

export async function listDiscordGuildMembers(serverId: string): Promise<{
  serverId: string
  serverName: string
  members: DiscordGuildMemberSummary[]
}> {
  assertLiveDiscordGuildId(serverId, 'member browsing')

  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord member browsing needs the bot to be configured.')
  }

  if (
    isDiscordBotGatewayMode() &&
    (!getDiscordBotClient() || !discordPresenceBotState.connected)
  ) {
    throw new Error(
      'Discord member browsing is unavailable because the bot is not connected.',
    )
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

    throw new Error(
      `Discord is rate limiting member sync for this server. Try again in about ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds.`,
    )
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

export async function listDiscordGuildVoiceChannels(serverId: string): Promise<{
  serverId: string
  serverName: string
  channels: Array<{
    id: string
    name: string
  }>
}> {
  assertLiveDiscordGuildId(serverId, 'voice channel browsing')

  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error(
      'Discord voice channel browsing needs the bot to be configured.',
    )
  }

  if (
    isDiscordBotGatewayMode() &&
    (!getDiscordBotClient() || !discordPresenceBotState.connected)
  ) {
    throw new Error(
      'Discord voice channel browsing is unavailable because the bot is not connected.',
    )
  }

  if (isDiscordBotGatewayMode()) {
    const client = getDiscordBotClient()
    const guild =
      client?.guilds.cache.get(serverId) ??
      (await client?.guilds.fetch(serverId))

    if (!guild) {
      throw new Error('Discord guild not available.')
    }

    const channels = await guild.channels.fetch()
    const voiceChannels = [...channels.values()]
      .filter(
        (channel): channel is NonNullable<typeof channel> => channel != null,
      )
      .filter((channel) => channel.type === 2 || channel.type === 13)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))

    return {
      serverId: guild.id,
      serverName: guild.name,
      channels: voiceChannels,
    }
  }

  const [guild, channels] = await Promise.all([
    fetchDiscordGuildSummaryViaRest(serverId),
    fetchDiscordJson<Array<{ id: string; name: string; type: number }>>(
      `/guilds/${serverId}/channels`,
    ),
  ])

  const voiceChannels = channels
    .filter((channel) => channel.type === 2 || channel.type === 13)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    serverId: guild.id,
    serverName: guild.name,
    channels: voiceChannels,
  }
}

export async function sendDiscordGuildInvites(options: {
  serverId: string
  memberIds: string[]
  inviterLabel: string
  inviterDiscordUserId?: string | null
  inviteUrl: string
}): Promise<{
  serverId: string
  serverName: string
  results: DiscordGuildInviteSendResult[]
}> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Discord invite sending needs the bot to be configured.')
  }

  const { serverId, memberIds, inviterLabel, inviterDiscordUserId, inviteUrl } =
    options
  const memberList = await listDiscordGuildMembers(serverId)
  const memberById = new Map(
    memberList.members.map((member) => [member.id, member]),
  )
  const appUserIdentityCount = await prisma.userIdentity.count({
    where: {
      provider: 'DISCORD',
      providerUserId: {
        in: memberList.members.map((member) => member.id),
      },
    },
  })
  const results: DiscordGuildInviteSendResult[] = []
  const inviteSender = inviterDiscordUserId
    ? `<@${inviterDiscordUserId}>`
    : inviterLabel
  const inviteLandingUrl = buildInviteLandingUrl({
    serverId,
    serverName: memberList.serverName,
    inviterDiscordUserId,
    inviterLabel,
    memberCount: appUserIdentityCount,
    kind: 'direct',
    fallbackUrl: inviteUrl,
  })
  const inviteTargets = [...new Set(memberIds)]
    .map((memberId) => {
      const knownMember = memberById.get(memberId)

      if (!knownMember) {
        results.push({
          memberId,
          username: 'unknown-user',
          displayName: 'Unknown user',
          status: 'failed',
          error: 'This Discord user was not found in the selected server.',
        })

        return null
      }

      return {
        memberId,
        knownMember,
        payload: {
          discordUserId: memberId,
          content: `${inviteSender} invited you to Game's Up from ${memberList.serverName}.`,
          embeds: buildDiscordInviteEmbeds({
            serverName: memberList.serverName,
            inviterLabel,
            inviteUrl: inviteLandingUrl,
            appMemberCount: appUserIdentityCount,
          }),
          components: buildDiscordInviteComponents(inviteLandingUrl),
        },
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        memberId: string
        knownMember: DiscordGuildMemberSummary
        payload: {
          discordUserId: string
          content: string
          embeds: ReturnType<typeof buildDiscordInviteEmbeds>
          components: ReturnType<typeof buildDiscordInviteComponents>
        }
      } => entry != null,
    )

  const dmResults = await sendDiscordDirectMessages(
    inviteTargets.map((entry) => entry.payload),
  )
  const dmResultByUserId = new Map(
    dmResults.map((result) => [result.discordUserId, result]),
  )

  for (const target of inviteTargets) {
    const dmResult = dmResultByUserId.get(target.memberId)

    results.push({
      memberId: target.memberId,
      username: target.knownMember.username,
      displayName: target.knownMember.displayName,
      status: dmResult?.status === 'sent' ? 'sent' : 'failed',
      error:
        dmResult?.status === 'sent'
          ? null
          : (dmResult?.error ?? 'Unable to send a Discord DM.'),
    })
  }

  return {
    serverId,
    serverName: memberList.serverName,
    results,
  }
}

export async function startDiscordPresenceBot() {
  if (started) {
    return
  }

  started = true

  if (!env.DISCORD_BOT_TOKEN) {
    console.log(
      'Discord presence bot disabled: DISCORD_BOT_TOKEN is not configured.',
    )
    return
  }

  if (!isDiscordBotGatewayMode()) {
    console.log(
      `Discord presence bot gateway disabled: DISCORD_BOT_MODE=${getDiscordBotMode()}. REST-only Discord browsing and DM features remain available.`,
    )
    return
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
  })

  client.ws.on(GatewayDispatchEvents.MessageCreate, (rawMessage, shardId) => {
    if (rawMessage == null || typeof rawMessage !== 'object') {
      return
    }

    const directMessage = rawMessage as GatewayMessageCreateDispatchData

    if (
      typeof directMessage.guild_id === 'string' ||
      directMessage.author.bot
    ) {
      return
    }

    if (!claimDiscordDirectMessage(directMessage.id)) {
      return
    }

    void handleDiscordDirectMessagePayload({
      authorId: directMessage.author.id,
      content:
        typeof directMessage.content === 'string' ? directMessage.content : '',
      source: `gateway-raw:${shardId}`,
      reply: async (content, options: DirectMessageReplyOptions = {}) => {
        const [result] = await sendDiscordDirectMessages([
          {
            discordUserId: directMessage.author.id,
            ...buildDirectMessageReplyPayload(content, options),
          },
        ])

        if (!result || result.status !== 'sent') {
          throw new Error(
            result?.error ?? 'Discord did not confirm the DM reply send.',
          )
        }

        if (
          options.autoDeleteAfterMs &&
          options.autoDeleteAfterMs > 0 &&
          result.channelId &&
          result.messageId
        ) {
          scheduleGatewayDirectMessageDeletion(
            result.channelId,
            result.messageId,
            options.autoDeleteAfterMs,
          )
        }
      },
    }).catch((error) => {
      releaseDiscordDirectMessage(directMessage.id)
      const description =
        error instanceof Error
          ? error.message
          : 'Unknown raw Discord DM command error'
      discordPresenceBotState.lastError = description
      console.error('Discord raw DM command handler failed', error)
    })
  })

  setDiscordBotClient(client)
  await registerDiscordSlashCommands()

  client.once(Events.ClientReady, () => {
    discordPresenceBotState.connected = true
    discordPresenceBotState.userTag = client.user?.tag ?? null
    discordPresenceBotState.lastReadyAt = new Date().toISOString()
    discordPresenceBotState.lastError = null
    syncDiscordPresenceBotGuildIds()
    console.log(
      `Discord presence bot connected as ${discordPresenceBotState.userTag ?? 'unknown-user'} across ${discordPresenceBotState.guildIds.length} guild(s).`,
    )
  })

  client.on('presenceUpdate', (_oldPresence, newPresence) => {
    void handlePresenceUpdate(newPresence)
  })

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceStateUpdate(oldState, newState)
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
    void handlePlayIntentDiscordSpaceMemberJoin({
      serverId: member.guild.id,
      discordUserId: member.user.id,
    }).catch((error) => {
      console.error(
        'Failed to handle complementary Discord space member join',
        error,
      )
    })
  })

  client.on(Events.GuildMemberRemove, (member) => {
    invalidateGuildAccessCache(member.guild.id)
    invalidateGuildMemberCache(member.guild.id)
  })

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void handleDiscordSlashCommand(interaction)
      return
    }

    if (
      (interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()) &&
      isAccountHubCustomId(interaction.customId)
    ) {
      void handleAccountHubInteraction(interaction).catch((error) => {
        console.error('Discord account hub interaction failed', error)
      })
      return
    }

    if (
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith(playIntentFriendInvitePrefix)
    ) {
      void handlePlayIntentFriendInviteInteraction(interaction).catch(
        (error) => {
          console.error('Discord friend invitation handler failed', error)
        },
      )
      return
    }

    if (interaction.isStringSelectMenu()) {
      if (isCtpComposerCustomId(interaction.customId)) {
        void runDiscordMessageAction(
          interaction,
          () => handleCtpComposerSelectInteraction(interaction),
          {
            lockKey: composerDraftId(interaction.customId),
            opensModal: ctpComposerInteractionOpensModal(interaction),
            privateLaunch:
              interaction.customId === 'guild-ctp:open' &&
              !interaction.message.flags.has(MessageFlags.Ephemeral),
          },
        )
      }
      return
    }

    if (interaction.isModalSubmit()) {
      if (isCtpComposerCustomId(interaction.customId)) {
        void runDiscordMessageAction(
          interaction,
          () => handleCtpComposerModalSubmit(interaction),
          { lockKey: composerDraftId(interaction.customId) },
        )
      } else if (isRunningLateModalCustomId(interaction.customId)) {
        void handleRunningLateModalSubmit(interaction)
      }
      return
    }

    if (!interaction.isButton()) {
      return
    }

    if (isCtpComposerCustomId(interaction.customId)) {
      void runDiscordMessageAction(
        interaction,
        () => handleCtpComposerButtonInteraction(interaction),
        {
          lockKey: composerDraftId(interaction.customId),
          opensModal: ctpComposerInteractionOpensModal(interaction),
          privateLaunch:
            interaction.customId === 'guild-ctp:open' &&
            !interaction.message.flags.has(MessageFlags.Ephemeral),
        },
      )
      return
    }

    if (interaction.customId.startsWith('dm-command:')) {
      void runDiscordMessageAction(interaction, () =>
        handleDiscordDirectMessageButtonInteraction(interaction),
      )
      return
    }

    if (interaction.customId.startsWith('auto-play:')) {
      void runDiscordMessageAction(interaction, () =>
        handleDiscordAutoPlayPromptInteraction(interaction),
      )
      return
    }

    if (isPlayIntentNotificationCustomId(interaction.customId)) {
      void runDiscordMessageAction(
        interaction,
        () => handlePlayIntentNotificationInteraction(interaction),
        { opensModal: interaction.customId.endsWith(':late') },
      )
      return
    }

    if (isCreatorPlayIntentSummaryCustomId(interaction.customId)) {
      void runDiscordMessageAction(interaction, () =>
        handleCreatorPlayIntentSummaryInteraction(interaction),
      )
      return
    }

    if (isScheduledPlayIntentCheckInCustomId(interaction.customId)) {
      void runDiscordMessageAction(interaction, () =>
        handleScheduledPlayIntentCheckInInteraction(interaction),
      )
    }
  })

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) {
      return
    }

    if (message.inGuild()) {
      void markPlayIntentDiscordSpaceChannelActivity([message.channelId]).catch(
        (error) => {
          console.error('Failed to record Discord channel activity', error)
        },
      )
      return
    }

    if (!claimDiscordDirectMessage(message.id)) {
      return
    }

    void handleDiscordDirectMessageCommand(message).catch((error) => {
      if (!message.author.bot && !message.inGuild()) {
        releaseDiscordDirectMessage(message.id)
      }

      const description =
        error instanceof Error
          ? error.message
          : 'Unknown Discord DM command error'
      discordPresenceBotState.lastError = description
      console.error('Discord DM command handler failed', error)
    })
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
    discordPresenceBotState.lastError =
      error instanceof Error ? error.message : 'Unknown Discord bot login error'
    console.error('Discord presence bot failed to start', error)
  }
}
