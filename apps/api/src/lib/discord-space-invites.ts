/**
 * Role-granting invites for private call-to-play spaces. Discord assigns the
 * space role on acceptance, including for existing server members, so sharing
 * an invite does not depend on the bot observing a GuildMemberAdd event.
 */
import { PlayIntentDiscordSpaceStatus } from '@prisma/client'
import { z } from 'zod'
import { ChannelType, PermissionFlagsBits, Routes, type REST } from 'discord.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { getDiscordBotRest } from './discord-bot-runtime.js'

const discordSpaceInviteSchema = z.object({
  code: z.string().min(1),
  roles: z.array(z.object({ id: z.string().min(1) })).optional(),
  uses: z.number().int().nonnegative().optional()
})
type DiscordSpaceInvite = z.infer<typeof discordSpaceInviteSchema>

/** Only reuse invites that grant exactly this space's role, without extra access. */
export function inviteGrantsDiscordSpaceRole(invite: DiscordSpaceInvite, roleId: string) {
  return invite.roles?.length === 1 && invite.roles[0]?.id === roleId
}

/** Create an unrestricted shareable invite that unlocks just the selected space. */
export async function createDiscordSpaceInvite(
  channelId: string,
  roleId: string,
  rest: Pick<REST, 'post'> | null = getDiscordBotRest()
) {
  if (!rest) {
    throw new Error('Discord invite creation needs the bot token to be configured.')
  }

  const response = await rest.post(Routes.channelInvites(channelId), {
    body: {
      max_age: 0,
      max_uses: 0,
      temporary: false,
      unique: true,
      role_ids: [roleId]
    }
  })

  const invite = discordSpaceInviteSchema.parse(response)

  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    url: `https://discord.gg/${invite.code}`
  }
}

/** Retire a space invite; already deleted invites need no further cleanup. */
export async function deleteDiscordSpaceInvite(inviteCode: string | null | undefined) {
  if (!inviteCode) {
    return
  }

  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord invite deletion needs the bot token to be configured.')
  }

  try {
    await rest.delete(Routes.invite(inviteCode))
  } catch (error) {
    if (isUnknownInviteError(error)) {
      return
    }

    throw error
  }
}

/**
 * Picks the channel a space invite should point at.
 *
 * The temporary channels deny `ViewChannel` to `@everyone`, so an invite
 * targeting them is useless to the people it exists for: someone who is not in
 * the server yet cannot see the target channel, and Discord gives them a dead
 * invite instead of a join prompt. Invites therefore point at a channel a
 * brand-new member can actually land on (rules channel, system channel, or the
 * first `@everyone`-visible text channel). Access to the temporary channels is
 * granted by the invite's role assignment, not by the invite target.
 *
 * Returns null when the guild exposes no public channel, in which case the
 * caller falls back to the space's own text channel.
 */
async function resolvePublicInviteChannelId(serverId: string) {
  const rest = getDiscordBotRest()

  if (!rest) {
    return null
  }

  try {
    const guild = await rest.get(Routes.guild(serverId)) as {
      rules_channel_id?: string | null;
      system_channel_id?: string | null;
    } | null

    const announcedChannelId = guild?.rules_channel_id ?? guild?.system_channel_id ?? null

    if (announcedChannelId) {
      return announcedChannelId
    }

    const channels = (await rest.get(Routes.guildChannels(serverId)) as Array<{
      id?: string;
      type?: number;
      position?: number;
      parent_id?: string | null;
      permission_overwrites?: Array<{ id?: string; deny?: string }>;
    }> | null) ?? []
    const channelsById = new Map(channels.flatMap((channel) => channel.id ? [[channel.id, channel] as const] : []))
    const deniesEveryoneView = (channel: (typeof channels)[number] | undefined) => (
      (channel?.permission_overwrites ?? []).some((overwrite) => (
        overwrite.id === serverId
        && (BigInt(overwrite.deny ?? '0') & PermissionFlagsBits.ViewChannel) !== 0n
      ))
    )

    const publicTextChannels = channels
      .filter((channel) => (
        typeof channel.id === 'string'
        && channel.type === ChannelType.GuildText
        && !deniesEveryoneView(channel)
        // A channel with no overwrites of its own still inherits a private
        // category, which is exactly how the temporary spaces are shaped.
        && !deniesEveryoneView(channel.parent_id ? channelsById.get(channel.parent_id) : undefined)
      ))
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))

    return publicTextChannels[0]?.id ?? null
  } catch (error) {
    console.error('Failed to resolve a public invite channel for a complementary Discord space', {
      serverId,
      error
    })

    return null
  }
}

type InviteUpgradeableSpace = {
  id: string;
  serverId: string;
  roleId: string;
  textChannelId: string;
  inviteCode: string | null;
  inviteUseCount: number;
}

type CreatedSpaceInvite = Awaited<ReturnType<typeof createDiscordSpaceInvite>>
type SpaceInviteDependencies = {
  rest: Pick<REST, 'get' | 'post'> | null;
  resolvePublicChannelId: typeof resolvePublicInviteChannelId;
  saveInvite: (spaceId: string, invite: CreatedSpaceInvite) => Promise<void>;
  retireInvite: typeof deleteDiscordSpaceInvite;
}

/** Persist the current shareable link before any older link is retired. */
async function saveDiscordSpaceInvite(spaceId: string, invite: CreatedSpaceInvite) {
  await prisma.playIntentDiscordSpace.update({
    where: { id: spaceId },
    data: {
      inviteCode: invite.code,
      inviteUseCount: invite.uses,
      inviteUrl: invite.url
    }
  })
}

/** Preserve working role invites; replace legacy server-only or deleted invites. */
export async function ensurePlayIntentDiscordSpaceInvite(
  space: InviteUpgradeableSpace,
  dependencies: SpaceInviteDependencies = {
    rest: getDiscordBotRest(),
    resolvePublicChannelId: resolvePublicInviteChannelId,
    saveInvite: saveDiscordSpaceInvite,
    retireInvite: deleteDiscordSpaceInvite
  }
) {
  const { rest } = dependencies

  if (space.inviteCode && rest) {
    try {
      const existingInvite = discordSpaceInviteSchema.parse(await rest.get(Routes.invite(space.inviteCode)))

      if (inviteGrantsDiscordSpaceRole(existingInvite, space.roleId)) {
        return {
          code: space.inviteCode,
          url: `https://discord.gg/${space.inviteCode}`,
          uses: space.inviteUseCount
        }
      }
    } catch (error) {
      if (!isUnknownInviteError(error)) {
        throw error
      }
    }
  }

  const channelId = await dependencies.resolvePublicChannelId(space.serverId) ?? space.textChannelId
  const invite = await createDiscordSpaceInvite(channelId, space.roleId, rest)

  // Store the replacement before retiring the old link, so a failed Discord
  // deletion cannot leave the app pointing at a deleted invite.
  try {
    await dependencies.saveInvite(space.id, invite)
  } catch (error) {
    // A replacement that never became the stored link must not linger as an
    // untracked, never-expiring entry point to the private channels.
    try {
      await dependencies.retireInvite(invite.code)
    } catch (cleanupError) {
      console.error('Failed to retire an unsaved temporary Discord space invite', { spaceId: space.id, cleanupError })
    }

    throw error
  }

  try {
    await dependencies.retireInvite(space.inviteCode)
  } catch (error) {
    console.error('Failed to retire a replaced temporary Discord space invite', { spaceId: space.id, error })
  }

  return invite
}

/** Load only provisioned spaces that can safely receive a replacement invite. */
async function findInviteUpgradeableSpaces(): Promise<InviteUpgradeableSpace[]> {
  const rest = getDiscordBotRest()

  if (!env.DISCORD_SERVER_ID || !rest) {
    return []
  }

  const rows = await prisma.playIntentDiscordSpace.findMany({
    where: {
      serverId: env.DISCORD_SERVER_ID,
      deletedAt: null,
      status: { in: [PlayIntentDiscordSpaceStatus.ACTIVE, PlayIntentDiscordSpaceStatus.RETAINED] },
      roleId: { not: null },
      textChannelId: { not: null }
    },
    select: {
      id: true,
      serverId: true,
      roleId: true,
      textChannelId: true,
      inviteCode: true,
      inviteUseCount: true
    }
  })

  if (rows.length === 0) {
    return []
  }

  // Inspect the guild once per sweep rather than fetching every working invite.
  const invites = z.array(discordSpaceInviteSchema).parse(await rest.get(Routes.guildInvites(env.DISCORD_SERVER_ID)))
  const invitesByCode = new Map(invites.map((invite) => [invite.code, invite]))

  return rows.filter((row): row is InviteUpgradeableSpace => {
    if (row.roleId === null || row.textChannelId === null) {
      return false
    }

    const invite = row.inviteCode ? invitesByCode.get(row.inviteCode) : undefined
    return !invite || !inviteGrantsDiscordSpaceRole(invite, row.roleId)
  })
}

/** Upgrade live spaces without reprovisioning channels or resetting retention. */
export async function sweepUpgradePlayIntentDiscordSpaceInvites(options: {
  findSpaces?: () => Promise<InviteUpgradeableSpace[]>;
  ensureInvite?: (space: InviteUpgradeableSpace) => Promise<{ code: string }>;
  refreshMessages?: () => Promise<void>;
} = {}) {
  let spaces: InviteUpgradeableSpace[]

  try {
    spaces = await (options.findSpaces ?? findInviteUpgradeableSpaces)()
  } catch (error) {
    console.error('Failed to inspect temporary Discord space invites for upgrade', { error })
    return
  }

  let changed = false

  for (const space of spaces) {
    try {
      const invite = await (options.ensureInvite ?? ensurePlayIntentDiscordSpaceInvite)(space)
      changed ||= invite.code !== space.inviteCode
    } catch (error) {
      // A failed upgrade should not stop cleanup or hide working channels.
      console.error('Failed to upgrade a temporary Discord space invite', { spaceId: space.id, error })
    }
  }

  if (changed) {
    publishPlayIntentInvalidation()
    try {
      await (options.refreshMessages ?? (async () => {
        const notifications = await import('./play-intent-notification-responses.js')
        await notifications.refreshTrackedPlayIntentNotificationDirectMessages()
        await notifications.refreshTrackedCreatorPlayIntentSummaryMessages()
      }))()
    } catch (error) {
      // Link refresh is best effort and must not prevent due channel deletion.
      console.error('Failed to refresh Discord messages after temporary space invite upgrade', { error })
    }
  }
}

/** Discord uses code 10006 when an invite has expired or been deleted. */
function isUnknownInviteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (typeof error === 'object' && error !== null && 'code' in error && error.code === 10006)
    || /Unknown Invite/i.test(message)
}
