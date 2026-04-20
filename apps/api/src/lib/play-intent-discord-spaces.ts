import { AuthProvider, PlayIntentDiscordSpaceStatus } from '@prisma/client'
import { ChannelType, OverwriteType, PermissionFlagsBits, Routes } from 'discord.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { env } from './env.js'
import { getDiscordBotRest } from './discord-bot-runtime.js'
import { prisma } from './prisma.js'

type ProvisionableSpace = Awaited<ReturnType<typeof loadProvisionableSpace>>

export type PlayIntentDiscordSpaceRecipientContext = {
  status: 'active' | 'retained' | 'delete-requested';
  recipientInServer: boolean;
  textChannelName: string | null;
  textChannelUrl: string | null;
  voiceChannelName: string | null;
  voiceChannelUrl: string | null;
  inviteUrl: string | null;
}

const complementarySpaceActiveStatuses: PlayIntentDiscordSpaceStatus[] = [
  PlayIntentDiscordSpaceStatus.ACTIVE,
  PlayIntentDiscordSpaceStatus.RETAINED,
  PlayIntentDiscordSpaceStatus.DELETE_REQUESTED
]
const complementarySpaceRetentionMs = 7 * 24 * 60 * 60 * 1000
const discordSpaceGrantFailureMessage = 'Some Discord channel access grants could not be applied. Check that the Game\'s Up bot can manage roles in the Discord server.'
const discordSpaceCreatorMissingIdentityMessage = 'The call-to-play creator no longer has a linked Discord account, so the temporary Discord channels could not be granted.'
const discordSpaceCreatorJoinServerMessage = 'The call-to-play creator is not currently in the Game\'s Up Discord server. Join the server to reveal the temporary channels.'
const discordSpaceCreatorGrantFailureMessage = 'The call-to-play creator could not be granted the temporary Discord channel role. Check that the Game\'s Up bot can manage roles in the Discord server.'

function normalizeNameSegment(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

  return normalized.length > 0 ? normalized : fallback
}

function buildComplementarySpaceNames(playIntent: { id: string; headline: string; user: { displayName: string } }) {
  const shortId = playIntent.id.slice(0, 6)
  const titleSegment = normalizeNameSegment(playIntent.headline, 'call-to-play')
  const creatorSegment = normalizeNameSegment(playIntent.user.displayName, 'player')
  const base = `${titleSegment}-${shortId}`.slice(0, 42)

  return {
    roleName: `ctp-${base}`.slice(0, 100),
    categoryName: `${creatorSegment}-${base}`.slice(0, 100),
    textChannelName: `chat-${shortId}`,
    voiceChannelName: `voice-${shortId}`
  }
}

function isUnknownDiscordResourceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')

  return /Unknown (Channel|Role|Invite|Member)/i.test(message)
}

function buildBasePermissionOverwrites(roleId: string) {
  return [
    {
      id: env.DISCORD_SERVER_ID ?? '',
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel.toString(),
      allow: '0'
    },
    {
      id: roleId,
      type: OverwriteType.Role,
      allow: PermissionFlagsBits.ViewChannel.toString(),
      deny: '0'
    }
  ]
}

function buildTextPermissionOverwrites(roleId: string) {
  return [
    {
      id: env.DISCORD_SERVER_ID ?? '',
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel.toString(),
      allow: '0'
    },
    {
      id: roleId,
      type: OverwriteType.Role,
      allow: (
        PermissionFlagsBits.ViewChannel
        | PermissionFlagsBits.SendMessages
        | PermissionFlagsBits.ReadMessageHistory
        | PermissionFlagsBits.AttachFiles
        | PermissionFlagsBits.EmbedLinks
      ).toString(),
      deny: '0'
    }
  ]
}

function buildVoicePermissionOverwrites(roleId: string) {
  return [
    {
      id: env.DISCORD_SERVER_ID ?? '',
      type: OverwriteType.Role,
      deny: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect).toString(),
      allow: '0'
    },
    {
      id: roleId,
      type: OverwriteType.Role,
      allow: (
        PermissionFlagsBits.ViewChannel
        | PermissionFlagsBits.Connect
        | PermissionFlagsBits.Speak
        | PermissionFlagsBits.Stream
        | PermissionFlagsBits.UseVAD
      ).toString(),
      deny: '0'
    }
  ]
}

async function loadProvisionableSpace(spaceId: string) {
  return prisma.playIntentDiscordSpace.findUnique({
    where: { id: spaceId },
    include: {
      playIntent: {
        select: {
          id: true,
          headline: true,
          user: {
            select: {
              displayName: true
            }
          }
        }
      },
      accessGrants: {
        where: {
          revokedAt: null
        },
        include: {
          user: {
            select: {
              id: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    }
  })
}

async function loadDeletableSpace(spaceId: string) {
  return prisma.playIntentDiscordSpace.findUnique({
    where: { id: spaceId },
    select: {
      id: true,
      serverId: true,
      status: true,
      roleId: true,
      inviteCode: true,
      categoryChannelId: true,
      textChannelId: true,
      voiceChannelId: true
    }
  })
}

async function createRole(serverId: string, name: string) {
  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord role creation needs the bot token to be configured.')
  }

  const role = await rest.post(Routes.guildRoles(serverId), {
    body: {
      name,
      mentionable: false,
      hoist: false
    }
  })

  if (!role || typeof role !== 'object' || !('id' in role) || typeof role.id !== 'string') {
    throw new Error('Discord did not return a role id for the complementary space.')
  }

  return {
    id: role.id,
    name: 'name' in role && typeof role.name === 'string' ? role.name : name
  }
}

async function deleteInvite(inviteCode: string | null | undefined) {
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
    if (isUnknownDiscordResourceError(error)) {
      return
    }

    throw error
  }
}

async function createChannel(serverId: string, options: {
  name: string;
  type: ChannelType;
  parentId?: string;
  permissionOverwrites: Array<{ id: string; type: OverwriteType; allow: string; deny: string }>;
}) {
  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord channel creation needs the bot token to be configured.')
  }

  const channel = await rest.post(Routes.guildChannels(serverId), {
    body: {
      name: options.name,
      type: options.type,
      parent_id: options.parentId,
      permission_overwrites: options.permissionOverwrites
    }
  })

  if (!channel || typeof channel !== 'object' || !('id' in channel) || typeof channel.id !== 'string') {
    throw new Error('Discord did not return a channel id for the complementary space.')
  }

  return {
    id: channel.id,
    name: 'name' in channel && typeof channel.name === 'string' ? channel.name : options.name
  }
}

async function deleteChannel(channelId: string | null | undefined) {
  if (!channelId) {
    return
  }

  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord channel deletion needs the bot token to be configured.')
  }

  try {
    await rest.delete(Routes.channel(channelId))
  } catch (error) {
    if (isUnknownDiscordResourceError(error)) {
      return
    }

    throw error
  }
}

async function createInvite(channelId: string) {
  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord invite creation needs the bot token to be configured.')
  }

  const invite = await rest.post(Routes.channelInvites(channelId), {
    body: {
      max_age: 0,
      max_uses: 0,
      temporary: false,
      unique: true
    }
  })

  if (!invite || typeof invite !== 'object' || !('code' in invite) || typeof invite.code !== 'string') {
    throw new Error('Discord did not return an invite code for the complementary space.')
  }

  return {
    code: invite.code,
    uses: 'uses' in invite && typeof invite.uses === 'number' ? invite.uses : 0,
    url: `https://discord.gg/${invite.code}`
  }
}

async function addRoleToMember(serverId: string, discordUserId: string, roleId: string) {
  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord member role assignment needs the bot token to be configured.')
  }

  await rest.put(Routes.guildMemberRole(serverId, discordUserId, roleId))
}

type DiscordRoleGrantResult = {
  ok: boolean;
  reason: 'granted' | 'member-missing' | 'role-missing' | 'missing-access' | 'missing-permissions' | 'invalid-request' | 'unknown-error';
  message: string | null;
}

function getDiscordApiErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code

  return typeof code === 'number' ? code : null
}

function getDiscordApiErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null
  }

  const status = (error as { status?: unknown }).status

  return typeof status === 'number' ? status : null
}

function describeDiscordRoleGrantError(error: unknown): DiscordRoleGrantResult {
  const code = getDiscordApiErrorCode(error)
  const status = getDiscordApiErrorStatus(error)
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown Discord role grant error.')

  if (code === 10007 || /Unknown Member/i.test(message)) {
    return {
      ok: false,
      reason: 'member-missing',
      message: 'Discord could not find that member in the server.'
    }
  }

  if (code === 10011 || /Unknown Role/i.test(message)) {
    return {
      ok: false,
      reason: 'role-missing',
      message: 'Discord could not find the temporary role for this call to play.'
    }
  }

  if (code === 50001 || /Missing Access/i.test(message)) {
    return {
      ok: false,
      reason: 'missing-access',
      message: 'The Game\'s Up bot does not have access to manage this Discord server.'
    }
  }

  if (code === 50013 || /Missing Permissions/i.test(message) || status === 403) {
    return {
      ok: false,
      reason: 'missing-permissions',
      message: 'The Game\'s Up bot cannot assign the temporary role in this Discord server. Check Manage Roles permission and bot role hierarchy.'
    }
  }

  if (code === 50035) {
    return {
      ok: false,
      reason: 'invalid-request',
      message: 'Discord rejected the temporary role grant request as invalid.'
    }
  }

  return {
    ok: false,
    reason: 'unknown-error',
    message
  }
}

async function tryGrantRoleToMember(serverId: string, discordUserId: string, roleId: string): Promise<DiscordRoleGrantResult> {
  try {
    await addRoleToMember(serverId, discordUserId, roleId)
    return {
      ok: true,
      reason: 'granted',
      message: null
    }
  } catch (error) {
    return describeDiscordRoleGrantError(error)
  }
}

async function deleteRole(serverId: string, roleId: string | null | undefined) {
  if (!roleId) {
    return
  }

  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord role deletion needs the bot token to be configured.')
  }

  try {
    await rest.delete(Routes.guildRole(serverId, roleId))
  } catch (error) {
    if (isUnknownDiscordResourceError(error)) {
      return
    }

    throw error
  }
}

async function fetchGuildInviteUses(serverId: string) {
  const rest = getDiscordBotRest()

  if (!rest) {
    throw new Error('Discord invite inspection needs the bot token to be configured.')
  }

  const invites = await rest.get(Routes.guildInvites(serverId))

  if (!Array.isArray(invites)) {
    return new Map<string, number>()
  }

  return new Map(invites.flatMap((invite) => {
    if (!invite || typeof invite !== 'object' || !('code' in invite) || typeof invite.code !== 'string') {
      return []
    }

    return [[invite.code, 'uses' in invite && typeof invite.uses === 'number' ? invite.uses : 0] as const]
  }))
}

async function syncGrantedMembers(space: NonNullable<ProvisionableSpace>) {
  if (!space.roleId) {
    return {
      lastSyncError: null
    }
  }

  const membershipRows = await prisma.discordServerMembership.findMany({
    where: {
      serverId: space.serverId,
      userId: {
        in: space.accessGrants.map((grant) => grant.userId)
      }
    },
    select: {
      userId: true
    }
  })
  const membershipSet = new Set(membershipRows.map((row) => row.userId))
  const now = new Date()
  let hadGrantErrors = false
  let creatorSyncError: string | null = null

  for (const grant of space.accessGrants) {
    const isCreatorGrant = grant.source === 'CREATOR'
    const discordUserId = grant.user.identities[0]?.providerUserId ?? null
    const hadRoleBefore = grant.roleGrantedAt != null
    let roleGrantResult: DiscordRoleGrantResult = {
      ok: false,
      reason: 'member-missing',
      message: null
    }

    if (discordUserId) {
      roleGrantResult = await tryGrantRoleToMember(space.serverId, discordUserId, space.roleId)

      if (!roleGrantResult.ok && roleGrantResult.reason !== 'member-missing') {
        hadGrantErrors = true
        console.error('Failed to grant complementary Discord space role', {
          spaceId: space.id,
          userId: grant.userId,
          discordUserId,
          reason: roleGrantResult.reason,
          error: roleGrantResult.message
        })
      }
    }

    const inServer = membershipSet.has(grant.userId) || roleGrantResult.ok

    if (!hadRoleBefore && !roleGrantResult.ok) {
      if (isCreatorGrant) {
        creatorSyncError = creatorSyncError ?? (
          !discordUserId
            ? discordSpaceCreatorMissingIdentityMessage
            : roleGrantResult.reason === 'missing-access' || roleGrantResult.reason === 'missing-permissions'
              ? roleGrantResult.message ?? discordSpaceCreatorGrantFailureMessage
              : roleGrantResult.reason === 'role-missing' || roleGrantResult.reason === 'invalid-request' || roleGrantResult.reason === 'unknown-error'
                ? roleGrantResult.message ?? discordSpaceCreatorGrantFailureMessage
                : inServer
                  ? discordSpaceCreatorGrantFailureMessage
                  : discordSpaceCreatorJoinServerMessage
        )
      } else if (discordUserId || inServer) {
        hadGrantErrors = true
      }
    }

    await prisma.playIntentDiscordSpaceAccessGrant.update({
      where: {
        spaceId_userId: {
          spaceId: space.id,
          userId: grant.userId
        }
      },
      data: {
        inServer,
        roleGrantedAt: roleGrantResult.ok ? (grant.roleGrantedAt ?? now) : grant.roleGrantedAt
      }
    })
  }

  return {
    lastSyncError: creatorSyncError ?? (hadGrantErrors ? discordSpaceGrantFailureMessage : null)
  }
}

function toRecipientContextStatus(status: PlayIntentDiscordSpaceStatus): PlayIntentDiscordSpaceRecipientContext['status'] {
  switch (status) {
    case PlayIntentDiscordSpaceStatus.RETAINED:
      return 'retained'
    case PlayIntentDiscordSpaceStatus.DELETE_REQUESTED:
      return 'delete-requested'
    default:
      return 'active'
  }
}

export async function getPlayIntentDiscordSpaceRecipientContexts(playIntentId: string, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueUserIds.length === 0) {
    return new Map<string, PlayIntentDiscordSpaceRecipientContext>()
  }

  const space = await prisma.playIntentDiscordSpace.findUnique({
    where: {
      playIntentId
    },
    select: {
      serverId: true,
      status: true,
      textChannelId: true,
      textChannelName: true,
      voiceChannelId: true,
      voiceChannelName: true,
      inviteUrl: true,
      accessGrants: {
        where: {
          userId: {
            in: uniqueUserIds
          },
          revokedAt: null
        },
        select: {
          userId: true,
          inServer: true,
          roleGrantedAt: true
        }
      }
    }
  })

  if (!space || !complementarySpaceActiveStatuses.includes(space.status)) {
    return new Map<string, PlayIntentDiscordSpaceRecipientContext>()
  }

  return new Map(space.accessGrants.map((grant) => [
    grant.userId,
    {
      status: toRecipientContextStatus(space.status),
      recipientInServer: grant.inServer,
      textChannelName: space.textChannelName,
      textChannelUrl: grant.roleGrantedAt ? buildDiscordChannelUrl(space.serverId, space.textChannelId) : null,
      voiceChannelName: space.voiceChannelName,
      voiceChannelUrl: grant.roleGrantedAt ? buildDiscordChannelUrl(space.serverId, space.voiceChannelId) : null,
      inviteUrl: space.inviteUrl
    }
  ]))
}

export async function markPlayIntentDiscordSpaceInviteSent(playIntentId: string, userId: string) {
  const space = await prisma.playIntentDiscordSpace.findUnique({
    where: { playIntentId },
    select: {
      id: true
    }
  })

  if (!space) {
    return
  }

  await prisma.playIntentDiscordSpaceAccessGrant.updateMany({
    where: {
      spaceId: space.id,
      userId,
      revokedAt: null
    },
    data: {
      inviteSentAt: new Date()
    }
  })
}

export async function markPlayIntentDiscordSpacesRetained(playIntentIds: string[], baseTime = new Date()) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  if (uniquePlayIntentIds.length === 0) {
    return
  }

  const retainedSpaces = await prisma.playIntentDiscordSpace.updateMany({
    where: {
      playIntentId: {
        in: uniquePlayIntentIds
      },
      deletedAt: null,
      status: {
        in: [
          PlayIntentDiscordSpaceStatus.REQUESTED,
          PlayIntentDiscordSpaceStatus.PROVISIONING,
          PlayIntentDiscordSpaceStatus.ACTIVE,
          PlayIntentDiscordSpaceStatus.PROVISION_FAILED,
          PlayIntentDiscordSpaceStatus.RETAINED
        ]
      }
    },
    data: {
      status: PlayIntentDiscordSpaceStatus.RETAINED,
      deleteAfter: new Date(baseTime.getTime() + complementarySpaceRetentionMs)
    }
  })

  if (retainedSpaces.count > 0) {
    publishPlayIntentInvalidation()
  }
}

async function deletePlayIntentDiscordSpace(spaceId: string) {
  const space = await loadDeletableSpace(spaceId)

  if (!space) {
    return { status: 'missing' as const }
  }

  if (space.status === PlayIntentDiscordSpaceStatus.DELETED) {
    return { status: 'deleted' as const }
  }

  await prisma.playIntentDiscordSpace.update({
    where: { id: space.id },
    data: {
      status: PlayIntentDiscordSpaceStatus.DELETE_REQUESTED,
      deleteRequestedAt: new Date(),
      lastSyncError: null,
      deleteAfter: null
    }
  })

  try {
    await deleteInvite(space.inviteCode)
    await deleteChannel(space.textChannelId)
    await deleteChannel(space.voiceChannelId)
    await deleteChannel(space.categoryChannelId)
    await deleteRole(space.serverId, space.roleId)

    const now = new Date()
    await prisma.playIntentDiscordSpace.update({
      where: { id: space.id },
      data: {
        status: PlayIntentDiscordSpaceStatus.DELETED,
        deletedAt: now,
        lastSyncError: null,
        inviteCode: null,
        inviteUrl: null,
        deleteAfter: null,
        inviteUseCount: 0
      }
    })
    await prisma.playIntentDiscordSpaceAccessGrant.updateMany({
      where: {
        spaceId: space.id,
        revokedAt: null
      },
      data: {
        revokedAt: now
      }
    })

    publishPlayIntentInvalidation()

    return { status: 'deleted' as const }
  } catch (error) {
    await prisma.playIntentDiscordSpace.update({
      where: { id: space.id },
      data: {
        status: PlayIntentDiscordSpaceStatus.RETAINED,
        deleteAfter: new Date(Date.now() + complementarySpaceRetentionMs),
        lastSyncError: error instanceof Error ? error.message : 'Unknown complementary Discord space delete error.'
      }
    })
    console.error('Failed to delete complementary Discord space', {
      spaceId: space.id,
      error
    })

    publishPlayIntentInvalidation()

    return { status: 'failed' as const }
  }
}

export async function deletePlayIntentDiscordSpaceByPlayIntentId(playIntentId: string) {
  const space = await prisma.playIntentDiscordSpace.findUnique({
    where: {
      playIntentId
    },
    select: {
      id: true
    }
  })

  if (!space) {
    return { status: 'missing' as const }
  }

  return deletePlayIntentDiscordSpace(space.id)
}

export async function provisionPlayIntentDiscordSpace(spaceId: string) {
  const space = await loadProvisionableSpace(spaceId)

  if (!space) {
    return { status: 'missing' as const }
  }

  if (!env.DISCORD_SERVER_ID || space.serverId !== env.DISCORD_SERVER_ID) {
    await prisma.playIntentDiscordSpace.update({
      where: { id: space.id },
      data: {
        status: PlayIntentDiscordSpaceStatus.PROVISION_FAILED,
        lastSyncError: "Game's Up Discord server configuration is missing or does not match this space."
      }
    })
    publishPlayIntentInvalidation()
    return { status: 'failed' as const }
  }

  if (space.status === PlayIntentDiscordSpaceStatus.DELETED) {
    return { status: 'skipped' as const }
  }

  await prisma.playIntentDiscordSpace.update({
    where: { id: space.id },
    data: {
      status: PlayIntentDiscordSpaceStatus.PROVISIONING,
      lastSyncError: null
    }
  })

  try {
    const names = buildComplementarySpaceNames(space.playIntent)
    const role = space.roleId
      ? { id: space.roleId, name: space.roleName ?? names.roleName }
      : await createRole(space.serverId, names.roleName)
    if (!space.roleId) {
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          roleId: role.id,
          roleName: role.name
        }
      })
    }
    const category = space.categoryChannelId
      ? { id: space.categoryChannelId, name: space.categoryChannelName ?? names.categoryName }
      : await createChannel(space.serverId, {
          name: names.categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: buildBasePermissionOverwrites(role.id)
        })
    if (!space.categoryChannelId) {
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          categoryChannelId: category.id,
          categoryChannelName: category.name
        }
      })
    }
    const textChannel = space.textChannelId
      ? { id: space.textChannelId, name: space.textChannelName ?? names.textChannelName }
      : await createChannel(space.serverId, {
          name: names.textChannelName,
          type: ChannelType.GuildText,
          parentId: category.id,
          permissionOverwrites: buildTextPermissionOverwrites(role.id)
        })
    if (!space.textChannelId) {
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          textChannelId: textChannel.id,
          textChannelName: textChannel.name
        }
      })
    }
    const voiceChannel = space.voiceChannelId
      ? { id: space.voiceChannelId, name: space.voiceChannelName ?? names.voiceChannelName }
      : await createChannel(space.serverId, {
          name: names.voiceChannelName,
          type: ChannelType.GuildVoice,
          parentId: category.id,
          permissionOverwrites: buildVoicePermissionOverwrites(role.id)
        })
    if (!space.voiceChannelId) {
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          voiceChannelId: voiceChannel.id,
          voiceChannelName: voiceChannel.name
        }
      })
    }
    const invite = space.inviteCode
      ? { code: space.inviteCode, url: space.inviteUrl ?? `https://discord.gg/${space.inviteCode}`, uses: space.inviteUseCount }
      : await createInvite(textChannel.id)
    if (!space.inviteCode) {
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          inviteCode: invite.code,
          inviteUseCount: invite.uses,
          inviteUrl: invite.url
        }
      })
    }

    await prisma.playIntentDiscordSpace.update({
      where: { id: space.id },
      data: {
        status: PlayIntentDiscordSpaceStatus.ACTIVE,
        roleId: role.id,
        roleName: role.name,
        categoryChannelId: category.id,
        categoryChannelName: category.name,
        textChannelId: textChannel.id,
        textChannelName: textChannel.name,
        voiceChannelId: voiceChannel.id,
        voiceChannelName: voiceChannel.name,
        inviteCode: invite.code,
        inviteUseCount: invite.uses,
        inviteUrl: invite.url,
        provisionedAt: space.provisionedAt ?? new Date(),
        lastSyncError: null
      }
    })

    const refreshed = await loadProvisionableSpace(space.id)

    if (refreshed) {
      const syncResult = await syncGrantedMembers(refreshed)
      await prisma.playIntentDiscordSpace.update({
        where: { id: space.id },
        data: {
          lastSyncError: syncResult.lastSyncError
        }
      })
    }

    publishPlayIntentInvalidation()

    return { status: 'active' as const }
  } catch (error) {
    await prisma.playIntentDiscordSpace.update({
      where: { id: space.id },
      data: {
        status: PlayIntentDiscordSpaceStatus.PROVISION_FAILED,
        lastSyncError: error instanceof Error ? error.message : 'Unknown complementary Discord space provisioning error.'
      }
    })
    console.error('Failed to provision complementary Discord space', {
      spaceId: space.id,
      error
    })
    publishPlayIntentInvalidation()
    return { status: 'failed' as const }
  }
}

export async function provisionPlayIntentDiscordSpaceByPlayIntentId(playIntentId: string) {
  const space = await prisma.playIntentDiscordSpace.findUnique({
    where: {
      playIntentId
    },
    select: {
      id: true
    }
  })

  if (!space) {
    return { status: 'missing' as const }
  }

  return provisionPlayIntentDiscordSpace(space.id)
}

export async function sweepProvisionPendingPlayIntentDiscordSpaces() {
  const spaces = await prisma.playIntentDiscordSpace.findMany({
    where: {
      status: {
        in: [PlayIntentDiscordSpaceStatus.REQUESTED, PlayIntentDiscordSpaceStatus.PROVISION_FAILED]
      }
    },
    select: {
      id: true
    },
    take: 10,
    orderBy: {
      createdAt: 'asc'
    }
  })

  for (const space of spaces) {
    await provisionPlayIntentDiscordSpace(space.id)
  }
}

export async function sweepDeleteDuePlayIntentDiscordSpaces() {
  const dueSpaces = await prisma.playIntentDiscordSpace.findMany({
    where: {
      deletedAt: null,
      deleteAfter: {
        lte: new Date()
      },
      status: {
        in: [PlayIntentDiscordSpaceStatus.RETAINED, PlayIntentDiscordSpaceStatus.DELETE_REQUESTED]
      }
    },
    select: {
      id: true
    },
    take: 10,
    orderBy: {
      deleteAfter: 'asc'
    }
  })

  for (const space of dueSpaces) {
    await deletePlayIntentDiscordSpace(space.id)
  }
}

export async function handlePlayIntentDiscordSpaceMemberJoin(options: {
  serverId: string;
  discordUserId: string;
}) {
  if (options.serverId !== env.DISCORD_SERVER_ID) {
    return
  }

  let changed = false
  const creatorResolvedSpaceIds = new Set<string>()

  const [identity, spaces, inviteUses] = await Promise.all([
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: options.discordUserId
        }
      },
      select: {
        userId: true
      }
    }),
    prisma.playIntentDiscordSpace.findMany({
      where: {
        serverId: options.serverId,
        status: {
          in: complementarySpaceActiveStatuses
        },
        roleId: {
          not: null
        }
      },
      select: {
        id: true,
        roleId: true,
        inviteCode: true,
        inviteUseCount: true
      }
    }),
    fetchGuildInviteUses(options.serverId)
  ])

  if (identity) {
    const trackedGrantSpaces = await prisma.playIntentDiscordSpaceAccessGrant.findMany({
      where: {
        userId: identity.userId,
        revokedAt: null,
        space: {
          serverId: options.serverId,
          status: {
            in: complementarySpaceActiveStatuses
          },
          roleId: {
            not: null
          }
        }
      },
      select: {
        spaceId: true,
        source: true,
        roleGrantedAt: true,
        joinedViaInviteAt: true,
        space: {
          select: {
            roleId: true
          }
        }
      }
    })

    for (const grant of trackedGrantSpaces) {
      if (!grant.space.roleId) {
        continue
      }

      const roleGrantResult = await tryGrantRoleToMember(options.serverId, options.discordUserId, grant.space.roleId)

      if (!roleGrantResult.ok && roleGrantResult.reason !== 'member-missing') {
        console.error('Failed to grant complementary role on guild member join', {
          serverId: options.serverId,
          discordUserId: options.discordUserId,
          spaceId: grant.spaceId,
          reason: roleGrantResult.reason,
          error: roleGrantResult.message
        })
      }

      await prisma.playIntentDiscordSpaceAccessGrant.update({
        where: {
          spaceId_userId: {
            spaceId: grant.spaceId,
            userId: identity.userId
          }
        },
        data: {
          inServer: true,
          roleGrantedAt: roleGrantResult.ok ? (grant.roleGrantedAt ?? new Date()) : grant.roleGrantedAt,
          joinedViaInviteAt: grant.joinedViaInviteAt ?? new Date()
        }
      })

      if (grant.source === 'CREATOR' && roleGrantResult.ok && !grant.roleGrantedAt) {
        creatorResolvedSpaceIds.add(grant.spaceId)
      }

      changed = true
    }
  }

  const spacesWithInviteDelta = spaces.filter((space) => {
    if (!space.inviteCode) {
      return false
    }

    const currentUses = inviteUses.get(space.inviteCode) ?? space.inviteUseCount
    return currentUses > space.inviteUseCount
  })

  if (spacesWithInviteDelta.length === 1) {
    const matchedSpace = spacesWithInviteDelta[0]!

    if (matchedSpace.roleId) {
      const roleGrantResult = await tryGrantRoleToMember(options.serverId, options.discordUserId, matchedSpace.roleId)

      if (!roleGrantResult.ok && roleGrantResult.reason !== 'member-missing') {
        console.error('Failed to grant complementary role for invite-matched member join', {
          serverId: options.serverId,
          discordUserId: options.discordUserId,
          spaceId: matchedSpace.id,
          reason: roleGrantResult.reason,
          error: roleGrantResult.message
        })
      }
    }

    if (creatorResolvedSpaceIds.size > 0) {
      await prisma.playIntentDiscordSpace.updateMany({
        where: {
          id: {
            in: [...creatorResolvedSpaceIds]
          },
          lastSyncError: {
            in: [
              discordSpaceCreatorJoinServerMessage,
              discordSpaceCreatorGrantFailureMessage
            ]
          }
        },
        data: {
          lastSyncError: null
        }
      })
    }
  }

  if (changed) {
    publishPlayIntentInvalidation()
  }

  for (const space of spaces) {
    if (!space.inviteCode) {
      continue
    }

    const currentUses = inviteUses.get(space.inviteCode)

    if (currentUses == null || currentUses === space.inviteUseCount) {
      continue
    }

    await prisma.playIntentDiscordSpace.update({
      where: {
        id: space.id
      },
      data: {
        inviteUseCount: currentUses
      }
    })
  }
}