/**
 * Persists `InviteAttribution` records and the helpers used to read them.
 *
 * Slash-command and web invite landings carry server + inviter context
 * through Discord OAuth so the first sign-in can attribute the new account
 * to its source. Recent attributions are deduplicated within a 24-hour
 * window so a user re-clicking an invite during onboarding does not double
 * credit the inviter.
 */

import { AuthProvider as PrismaAuthProvider, DiscordInviteAttributionKind } from '@prisma/client'
import { env } from './env.js'
import { prisma } from './prisma.js'

type ParsedDiscordInviteAttribution = {
  serverId: string | null;
  serverName: string | null;
  inviterDiscordUserId: string | null;
  inviterLabel: string | null;
  memberCount: number | null;
  kind: DiscordInviteAttributionKind;
}

const inviteAttributionDedupWindowMs = 24 * 60 * 60 * 1000

function normalizeString(value: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function parseMemberCount(rawValue: string | null) {
  if (!rawValue) {
    return null
  }

  const parsed = Number(rawValue)

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : null
}

export function parseDiscordInviteAttributionFromRedirectTarget(redirectTarget: string): ParsedDiscordInviteAttribution | null {
  try {
    const redirectUrl = new URL(redirectTarget)
    const clientOrigin = new URL(env.CLIENT_ORIGIN)

    if (redirectUrl.origin !== clientOrigin.origin || redirectUrl.pathname !== '/invite') {
      return null
    }

    return {
      serverId: normalizeString(redirectUrl.searchParams.get('serverId')),
      serverName: normalizeString(redirectUrl.searchParams.get('server')),
      inviterDiscordUserId: normalizeString(redirectUrl.searchParams.get('inviterDiscordId')),
      inviterLabel: normalizeString(redirectUrl.searchParams.get('inviter')),
      memberCount: parseMemberCount(redirectUrl.searchParams.get('members')),
      kind: redirectUrl.searchParams.get('kind') === 'direct'
        ? DiscordInviteAttributionKind.DIRECT
        : DiscordInviteAttributionKind.SERVER
    }
  } catch {
    return null
  }
}

export async function recordDiscordInviteAttribution(options: {
  acceptedUserId: string;
  acceptedDiscordUserId: string;
  redirectTarget: string;
}) {
  const parsed = parseDiscordInviteAttributionFromRedirectTarget(options.redirectTarget)

  if (!parsed || (parsed.serverId == null && parsed.inviterDiscordUserId == null && parsed.inviterLabel == null)) {
    return null
  }

  if (parsed.inviterDiscordUserId && parsed.inviterDiscordUserId === options.acceptedDiscordUserId) {
    return null
  }

  const [inviterIdentity, existingRecentAttribution] = await Promise.all([
    parsed.inviterDiscordUserId
      ? prisma.userIdentity.findUnique({
          where: {
            provider_providerUserId: {
              provider: PrismaAuthProvider.DISCORD,
              providerUserId: parsed.inviterDiscordUserId
            }
          },
          select: {
            userId: true
          }
        })
      : Promise.resolve(null),
    prisma.discordInviteAttribution.findFirst({
      where: {
        acceptedUserId: options.acceptedUserId,
        inviterDiscordUserId: parsed.inviterDiscordUserId,
        serverId: parsed.serverId,
        kind: parsed.kind,
        acceptedAt: {
          gte: new Date(Date.now() - inviteAttributionDedupWindowMs)
        }
      },
      select: {
        id: true
      },
      orderBy: {
        acceptedAt: 'desc'
      }
    })
  ])

  if (existingRecentAttribution) {
    return existingRecentAttribution.id
  }

  if (parsed.serverId && parsed.serverName) {
    await prisma.discordServer.upsert({
      where: {
        id: parsed.serverId
      },
      update: {
        name: parsed.serverName
      },
      create: {
        id: parsed.serverId,
        name: parsed.serverName
      }
    })
  }

  const created = await prisma.discordInviteAttribution.create({
    data: {
      acceptedUserId: options.acceptedUserId,
      inviterUserId: inviterIdentity?.userId ?? null,
      inviterDiscordUserId: parsed.inviterDiscordUserId,
      inviterLabel: parsed.inviterLabel,
      serverId: parsed.serverId,
      serverName: parsed.serverName,
      hintedMemberCount: parsed.memberCount,
      kind: parsed.kind
    },
    select: {
      id: true
    }
  })

  return created.id
}

export async function getLatestDiscordInviteAttribution(userId: string) {
  const attribution = await prisma.discordInviteAttribution.findFirst({
    where: {
      acceptedUserId: userId
    },
    include: {
      inviterUser: {
        select: {
          id: true,
          displayName: true,
          handle: true
        }
      }
    },
    orderBy: {
      acceptedAt: 'desc'
    }
  })

  if (!attribution) {
    return null
  }

  return {
    inviterUserId: attribution.inviterUser?.id ?? null,
    inviterDiscordUserId: attribution.inviterDiscordUserId,
    inviterLabel: attribution.inviterLabel,
    inviterDisplayName: attribution.inviterUser?.displayName ?? null,
    inviterHandle: attribution.inviterUser?.handle ?? null,
    serverId: attribution.serverId,
    serverName: attribution.serverName,
    memberCount: attribution.hintedMemberCount,
    kind: attribution.kind === DiscordInviteAttributionKind.DIRECT ? 'direct' : 'server',
    acceptedAt: attribution.acceptedAt.toISOString()
  }
}