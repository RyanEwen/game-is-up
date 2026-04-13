import type { DiscordServerMembersResponse, DiscordServerPreferencesResponse } from '@game-is-up/shared'
import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import { prisma } from './prisma.js'
import type { DiscordGuildSummary } from './discord-auth.js'
import { getDiscordBotPresentServerIds, isDiscordBotPresentInGuild, listDiscordGuildMembers, sendDiscordGuildInvites } from './discord-presence-bot.js'

function buildDiscordServerIconUrl(serverId: string, iconHash: string | null): string | null {
  if (!iconHash) {
    return null
  }

  return `https://cdn.discordapp.com/icons/${serverId}/${iconHash}.png?size=128`
}

function formatDiscordInviteSender(displayName: string | null | undefined, handle: string | null | undefined): string {
  const normalizedDisplayName = displayName?.trim()
  const normalizedHandle = handle?.trim()

  if (normalizedDisplayName && normalizedHandle) {
    return `${normalizedDisplayName} (@${normalizedHandle})`
  }

  if (normalizedDisplayName) {
    return normalizedDisplayName
  }

  if (normalizedHandle) {
    return `@${normalizedHandle}`
  }

  return "A Game's Up player"
}

export async function syncDiscordServersForUser(userId: string, guilds: DiscordGuildSummary[]) {
  const serverIds = guilds.map((guild) => guild.id)

  await prisma.$transaction(async (transaction) => {
    for (const guild of guilds) {
      await transaction.discordServer.upsert({
        where: {
          id: guild.id
        },
        update: {
          name: guild.name,
          iconHash: guild.icon
        },
        create: {
          id: guild.id,
          name: guild.name,
          iconHash: guild.icon
        }
      })

      await transaction.discordServerMembership.upsert({
        where: {
          userId_serverId: {
            userId,
            serverId: guild.id
          }
        },
        update: {},
        create: {
          userId,
          serverId: guild.id
        }
      })
    }

    await transaction.discordServerMembership.deleteMany({
      where: {
        userId,
        ...(serverIds.length > 0
          ? {
              serverId: {
                notIn: serverIds
              }
            }
          : {})
      }
    })
  })
}

export async function buildDiscordServerPreferences(userId: string): Promise<DiscordServerPreferencesResponse> {
  const memberships = await prisma.discordServerMembership.findMany({
    where: {
      userId
    },
    include: {
      server: {
        include: {
          memberships: {
            select: {
              userId: true
            }
          }
        }
      }
    },
    orderBy: {
      server: {
        name: 'asc'
      }
    }
  })

  const preferences = await prisma.discordServerPreference.findMany({
    where: {
      userId
    },
    select: {
      serverId: true,
      includeInDiscovery: true
    }
  })

  const preferenceMap = new Map(preferences.map((preference) => [preference.serverId, preference.includeInDiscovery]))
  const botPresentServerIds = await getDiscordBotPresentServerIds(memberships.map((membership) => membership.server.id))

  return {
    servers: memberships.map((membership) => ({
      id: membership.server.id,
      name: membership.server.name,
      iconUrl: buildDiscordServerIconUrl(membership.server.id, membership.server.iconHash),
      botPresent: botPresentServerIds.has(membership.server.id),
      selected: botPresentServerIds.has(membership.server.id) && (preferenceMap.get(membership.server.id) ?? false),
      knownUserCount: Math.max(0, membership.server.memberships.filter((serverMembership) => serverMembership.userId !== userId).length)
    }))
  }
}

export async function updateDiscordServerPreference(userId: string, serverId: string, selected: boolean): Promise<'updated' | 'not-found' | 'bot-required'> {
  const membership = await prisma.discordServerMembership.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId
      }
    },
    select: {
      serverId: true
    }
  })

  if (!membership) {
    return 'not-found'
  }

  if (selected && !(await isDiscordBotPresentInGuild(serverId))) {
    return 'bot-required'
  }

  await prisma.discordServerPreference.upsert({
    where: {
      userId_serverId: {
        userId,
        serverId
      }
    },
    update: {
      includeInDiscovery: selected
    },
    create: {
      userId,
      serverId,
      includeInDiscovery: selected
    }
  })

  return 'updated'
}

export async function buildDiscordServerMembers(
  userId: string,
  serverId: string
): Promise<
  | { status: 'ok'; response: DiscordServerMembersResponse }
  | { status: 'not-found' }
  | { status: 'not-selected' }
  | { status: 'unavailable'; reason: string }
> {
  const [membership, preference] = await Promise.all([
    prisma.discordServerMembership.findUnique({
      where: {
        userId_serverId: {
          userId,
          serverId
        }
      },
      include: {
        server: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.discordServerPreference.findUnique({
      where: {
        userId_serverId: {
          userId,
          serverId
        }
      },
      select: {
        includeInDiscovery: true
      }
    })
  ])

  if (!membership) {
    return {
      status: 'not-found'
    }
  }

  if (!preference?.includeInDiscovery) {
    return {
      status: 'not-selected'
    }
  }

  try {
    const serverMembers = await listDiscordGuildMembers(serverId)
    const identities = await prisma.userIdentity.findMany({
      where: {
        provider: PrismaAuthProvider.DISCORD,
        providerUserId: {
          in: serverMembers.members.map((member) => member.id)
        }
      },
      select: {
        providerUserId: true,
        user: {
          select: {
            id: true,
            displayName: true,
            handle: true
          }
        }
      }
    })

    const appUserByDiscordId = new Map(
      identities.map((identity) => [identity.providerUserId, identity.user])
    )

    return {
      status: 'ok',
      response: {
        serverId,
        serverName: serverMembers.serverName || membership.server.name,
        members: serverMembers.members.map((member) => {
          const appUser = appUserByDiscordId.get(member.id)

          return {
            id: member.id,
            username: member.username,
            displayName: member.displayName,
            profileDisplayName: member.profileDisplayName,
            avatarUrl: member.avatarUrl,
            isAppUser: Boolean(appUser),
            appUserId: appUser?.id ?? null,
            appDisplayName: appUser?.displayName ?? null,
            appHandle: appUser?.handle ?? null
          }
        })
      }
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Discord member browsing is unavailable right now.'
    }
  }
}

export async function sendDiscordServerInvites(options: {
  userId: string;
  serverId: string;
  memberIds: string[];
  inviteUrl: string;
}): Promise<
  | {
      status: 'ok';
      response: {
        serverId: string;
        serverName: string;
        sentCount: number;
        failedCount: number;
        results: Array<{
          memberId: string;
          username: string;
          displayName: string;
          status: 'sent' | 'failed';
          error: string | null;
        }>;
      };
    }
  | { status: 'not-found' }
  | { status: 'not-selected' }
  | { status: 'unavailable'; reason: string }
> {
  const [membership, preference, user] = await Promise.all([
    prisma.discordServerMembership.findUnique({
      where: {
        userId_serverId: {
          userId: options.userId,
          serverId: options.serverId
        }
      },
      select: {
        serverId: true
      }
    }),
    prisma.discordServerPreference.findUnique({
      where: {
        userId_serverId: {
          userId: options.userId,
          serverId: options.serverId
        }
      },
      select: {
        includeInDiscovery: true
      }
    }),
    prisma.user.findUnique({
      where: {
        id: options.userId
      },
      select: {
        displayName: true,
        handle: true
      }
    })
  ])

  if (!membership) {
    return { status: 'not-found' }
  }

  if (!preference?.includeInDiscovery || !(await isDiscordBotPresentInGuild(options.serverId))) {
    return { status: 'not-selected' }
  }

  try {
    const serverMembers = await listDiscordGuildMembers(options.serverId)
    const memberById = new Map(serverMembers.members.map((member) => [member.id, member]))
    const identities = await prisma.userIdentity.findMany({
      where: {
        provider: PrismaAuthProvider.DISCORD,
        providerUserId: {
          in: options.memberIds
        }
      },
      select: {
        providerUserId: true
      }
    })
    const appUserDiscordIds = new Set(identities.map((identity) => identity.providerUserId))
    const inviteableMemberIds = options.memberIds.filter((memberId) => !appUserDiscordIds.has(memberId))
    const skippedResults = options.memberIds
      .filter((memberId) => appUserDiscordIds.has(memberId))
      .map((memberId) => {
        const member = memberById.get(memberId)

        return {
          memberId,
          username: member?.username ?? 'unknown-user',
          displayName: member?.displayName ?? member?.username ?? 'Unknown member',
          status: 'failed' as const,
          error: "Already on Game's Up."
        }
      })
    const inviteResults = inviteableMemberIds.length > 0
      ? await sendDiscordGuildInvites({
          serverId: options.serverId,
          memberIds: inviteableMemberIds,
          inviterLabel: formatDiscordInviteSender(user?.displayName, user?.handle),
          inviteUrl: options.inviteUrl
        })
      : {
          serverId: options.serverId,
          serverName: serverMembers.serverName,
          results: []
        }
    const orderedResults = options.memberIds
      .map((memberId) => skippedResults.find((result) => result.memberId === memberId) ?? inviteResults.results.find((result) => result.memberId === memberId))
      .filter((result): result is {
        memberId: string;
        username: string;
        displayName: string;
        status: 'sent' | 'failed';
        error: string | null;
      } => result != null)

    return {
      status: 'ok',
      response: {
        serverId: inviteResults.serverId,
        serverName: inviteResults.serverName,
        sentCount: orderedResults.filter((result) => result.status === 'sent').length,
        failedCount: orderedResults.filter((result) => result.status === 'failed').length,
        results: orderedResults
      }
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Discord invite sending is unavailable right now.'
    }
  }
}

export async function getSelectedDiscordServerIds(userId: string): Promise<string[]> {
  const preferences = await prisma.discordServerPreference.findMany({
    where: {
      userId,
      includeInDiscovery: true,
      server: {
        memberships: {
          some: {
            userId
          }
        }
      }
    },
    select: {
      serverId: true
    }
  })

  const botPresentServerIds = await getDiscordBotPresentServerIds(preferences.map((preference) => preference.serverId))

  if (botPresentServerIds.size === 0) {
    return []
  }

  return preferences
    .map((preference) => preference.serverId)
    .filter((serverId) => botPresentServerIds.has(serverId))
}

export async function countBotVisibleDiscordServersForUser(userId: string): Promise<number> {
  const memberships = await prisma.discordServerMembership.findMany({
    where: {
      userId
    },
    select: {
      serverId: true
    }
  })

  return (await getDiscordBotPresentServerIds(memberships.map((membership) => membership.serverId))).size
}

export async function getMutualDiscordServerNames(viewerId: string, candidateUserId: string): Promise<string[]> {
  const selectedServerIds = await getSelectedDiscordServerIds(viewerId)

  if (selectedServerIds.length === 0) {
    return []
  }

  const memberships = await prisma.discordServerMembership.findMany({
    where: {
      userId: candidateUserId,
      serverId: {
        in: selectedServerIds
      }
    },
    include: {
      server: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      server: {
        name: 'asc'
      }
    }
  })

  return memberships.map((membership) => membership.server.name)
}

export async function getMutualDiscoveryAudienceUserIds(userId: string): Promise<string[]> {
  const selectedServerIds = await getSelectedDiscordServerIds(userId)

  if (selectedServerIds.length === 0) {
    return []
  }

  const [memberships, preferences] = await Promise.all([
    prisma.discordServerMembership.findMany({
      where: {
        userId: {
          not: userId
        },
        serverId: {
          in: selectedServerIds
        }
      },
      select: {
        userId: true,
        serverId: true
      }
    }),
    prisma.discordServerPreference.findMany({
      where: {
        userId: {
          not: userId
        },
        includeInDiscovery: true,
        serverId: {
          in: selectedServerIds
        }
      },
      select: {
        userId: true,
        serverId: true
      }
    })
  ])

  const optedInPairs = new Set(preferences.map((preference) => `${preference.userId}:${preference.serverId}`))

  return [...new Set(
    memberships
      .filter((membership) => optedInPairs.has(`${membership.userId}:${membership.serverId}`))
      .map((membership) => membership.userId)
  )]
}