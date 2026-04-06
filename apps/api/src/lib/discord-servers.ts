import type { DiscordServerPreferencesResponse } from '@game-is-up/shared'
import { prisma } from './prisma.js'
import type { DiscordGuildSummary } from './discord-auth.js'

function buildDiscordServerIconUrl(serverId: string, iconHash: string | null): string | null {
  if (!iconHash) {
    return null
  }

  return `https://cdn.discordapp.com/icons/${serverId}/${iconHash}.png?size=128`
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

      await transaction.discordServerPreference.upsert({
        where: {
          userId_serverId: {
            userId,
            serverId: guild.id
          }
        },
        update: {},
        create: {
          userId,
          serverId: guild.id,
          includeInDiscovery: false
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

    await transaction.discordServerPreference.deleteMany({
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

  return {
    servers: memberships.map((membership) => ({
      id: membership.server.id,
      name: membership.server.name,
      iconUrl: buildDiscordServerIconUrl(membership.server.id, membership.server.iconHash),
      selected: preferenceMap.get(membership.server.id) ?? false,
      knownUserCount: Math.max(0, membership.server.memberships.filter((serverMembership) => serverMembership.userId !== userId).length)
    }))
  }
}

export async function updateDiscordServerPreference(userId: string, serverId: string, selected: boolean) {
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
    return false
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

  return true
}

export async function getSelectedDiscordServerIds(userId: string): Promise<string[]> {
  const preferences = await prisma.discordServerPreference.findMany({
    where: {
      userId,
      includeInDiscovery: true
    },
    select: {
      serverId: true
    }
  })

  return preferences.map((preference) => preference.serverId)
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