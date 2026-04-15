import { prisma } from './prisma.js'
import { env } from './env.js'
import { getDiscordBotPresentServerIds } from './discord-presence-bot.js'

const sampleFriendHandles = ['raidandrelax', 'nightqueue', 'supportmain', 'weekendwizard'] as const
const seededHandles = new Set(['technicallyreal', ...sampleFriendHandles])

export async function ensureDevelopmentSampleFriends(user: { id: string; handle: string }) {
  if (env.NODE_ENV === 'production' || seededHandles.has(user.handle)) {
    return
  }

  const existingFriendCount = await prisma.friend.count({
    where: {
      userId: user.id
    }
  })

  if (existingFriendCount > 0) {
    return
  }

  const sampleFriends = await prisma.user.findMany({
    where: {
      handle: {
        in: [...sampleFriendHandles]
      }
    },
    select: {
      id: true
    }
  })

  if (sampleFriends.length === 0) {
    return
  }

  await prisma.friend.createMany({
    data: sampleFriends.map((sampleFriend) => ({
      userId: user.id,
      friendedUserId: sampleFriend.id
    })),
    skipDuplicates: true
  })
}

export async function ensureDevelopmentSampleServerOverlap(user: { id: string; handle: string }) {
  if (env.NODE_ENV === 'production') {
    return
  }

  const [memberships, preferences, sampleUsers] = await Promise.all([
    prisma.discordServerMembership.findMany({
      where: {
        userId: user.id
      },
      select: {
        serverId: true,
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
    }),
    prisma.discordServerPreference.findMany({
      where: {
        userId: user.id,
        includeInDiscovery: true
      },
      select: {
        serverId: true
      }
    }),
    prisma.user.findMany({
      where: {
        handle: {
          in: [...sampleFriendHandles]
        }
      },
      select: {
        id: true
      }
    })
  ])

  if (memberships.length === 0 || sampleUsers.length === 0) {
    return
  }

  const membershipServerIds = memberships.map((membership) => membership.serverId)
  const botPresentServerIds = await getDiscordBotPresentServerIds(membershipServerIds)

  if (botPresentServerIds.size === 0) {
    return
  }

  const selectedServerIdSet = new Set(preferences.map((preference) => preference.serverId))
  const selectedRealBotVisibleServerIds = memberships
    .map((membership) => membership.serverId)
    .filter((serverId) => botPresentServerIds.has(serverId) && selectedServerIdSet.has(serverId))
  const targetServerIds = selectedRealBotVisibleServerIds.length > 0
    ? selectedRealBotVisibleServerIds.slice(0, 2)
    : memberships
        .map((membership) => membership.serverId)
        .filter((serverId) => botPresentServerIds.has(serverId))
        .slice(0, 1)

  if (targetServerIds.length === 0) {
    return
  }

  const primaryTargetServerId = targetServerIds[0]

  if (!primaryTargetServerId) {
    return
  }

  await prisma.discordServerMembership.createMany({
    data: sampleUsers.flatMap((sampleUser) => targetServerIds.map((serverId) => ({
      userId: sampleUser.id,
      serverId
    }))),
    skipDuplicates: true
  })

  for (const sampleUser of sampleUsers) {
    for (const serverId of targetServerIds) {
      await prisma.discordServerPreference.upsert({
        where: {
          userId_serverId: {
            userId: sampleUser.id,
            serverId
          }
        },
        update: {
          includeInDiscovery: true
        },
        create: {
          userId: sampleUser.id,
          serverId,
          includeInDiscovery: true
        }
      })
    }
  }

  if (selectedRealBotVisibleServerIds.length === 0) {
    await prisma.discordServerPreference.upsert({
      where: {
        userId_serverId: {
          userId: user.id,
          serverId: primaryTargetServerId
        }
      },
      update: {
        includeInDiscovery: true
      },
      create: {
        userId: user.id,
        serverId: primaryTargetServerId,
        includeInDiscovery: true
      }
    })
  }
}