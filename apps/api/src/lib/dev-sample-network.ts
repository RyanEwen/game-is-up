/**
 * Development-only seed helpers that retarget the demo network onto an admin.
 *
 * When an admin signs in locally, the seeded sample friends and the seeded
 * server-scoped or targeted calls to play are rebound to that admin's real
 * Discord network where possible so discovery and play-intent flows can be
 * exercised end-to-end without exposing demo data to signed-out or non-admin
 * users. Skipped outside dev environments and for accounts that already match
 * a seeded handle.
 */

import { prisma } from './prisma.js'
import { env } from './env.js'
import { getDiscordBotPresentServerIds } from './discord-presence-bot.js'
import { PlayIntentScope } from '../generated/prisma/client.js'

const sampleFriendHandles = [
  'raidandrelax',
  'nightqueue',
  'supportmain',
  'weekendwizard',
] as const
const defaultSeedViewerHandle = 'technicallyreal'
const seededHandles = new Set([defaultSeedViewerHandle, ...sampleFriendHandles])

export async function ensureDevelopmentSampleFriends(user: {
  id: string
  handle: string
  isAdmin: boolean
}) {
  if (
    env.NODE_ENV === 'production' ||
    !user.isAdmin ||
    seededHandles.has(user.handle)
  ) {
    return
  }

  const sampleFriends = await prisma.user.findMany({
    where: {
      handle: {
        in: [...sampleFriendHandles],
      },
    },
    select: {
      id: true,
    },
  })

  if (sampleFriends.length === 0) {
    return
  }

  await prisma.friend.createMany({
    data: sampleFriends.map((sampleFriend) => ({
      userId: user.id,
      friendedUserId: sampleFriend.id,
    })),
    skipDuplicates: true,
  })
}

export async function ensureDevelopmentSampleServerOverlap(user: {
  id: string
  handle: string
  isAdmin: boolean
}) {
  if (
    env.NODE_ENV === 'production' ||
    !user.isAdmin ||
    seededHandles.has(user.handle)
  ) {
    return
  }

  const [memberships, preferences, sampleUsers] = await Promise.all([
    prisma.discordServerMembership.findMany({
      where: {
        userId: user.id,
      },
      select: {
        serverId: true,
        server: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        server: {
          name: 'asc',
        },
      },
    }),
    prisma.discordServerPreference.findMany({
      where: {
        userId: user.id,
        includeInDiscovery: true,
      },
      select: {
        serverId: true,
      },
    }),
    prisma.user.findMany({
      where: {
        handle: {
          in: [...sampleFriendHandles],
        },
      },
      select: {
        id: true,
      },
    }),
  ])

  if (memberships.length === 0 || sampleUsers.length === 0) {
    return
  }

  const membershipServerIds = memberships.map(
    (membership) => membership.serverId,
  )
  const botPresentServerIds =
    await getDiscordBotPresentServerIds(membershipServerIds)

  if (botPresentServerIds.size === 0) {
    return
  }

  const selectedServerIdSet = new Set(
    preferences.map((preference) => preference.serverId),
  )
  const selectedRealBotVisibleServerIds = memberships
    .map((membership) => membership.serverId)
    .filter(
      (serverId) =>
        botPresentServerIds.has(serverId) && selectedServerIdSet.has(serverId),
    )
  const targetServerIds =
    selectedRealBotVisibleServerIds.length > 0
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
    data: sampleUsers.flatMap((sampleUser) =>
      targetServerIds.map((serverId) => ({
        userId: sampleUser.id,
        serverId,
      })),
    ),
    skipDuplicates: true,
  })

  for (const sampleUser of sampleUsers) {
    for (const serverId of targetServerIds) {
      await prisma.discordServerPreference.upsert({
        where: {
          userId_serverId: {
            userId: sampleUser.id,
            serverId,
          },
        },
        update: {
          includeInDiscovery: true,
        },
        create: {
          userId: sampleUser.id,
          serverId,
          includeInDiscovery: true,
        },
      })
    }
  }

  if (selectedRealBotVisibleServerIds.length === 0) {
    await prisma.discordServerPreference.upsert({
      where: {
        userId_serverId: {
          userId: user.id,
          serverId: primaryTargetServerId,
        },
      },
      update: {
        includeInDiscovery: true,
      },
      create: {
        userId: user.id,
        serverId: primaryTargetServerId,
        includeInDiscovery: true,
      },
    })
  }
}

export async function ensureDevelopmentSamplePlayIntentTargets(user: {
  id: string
  handle: string
  isAdmin: boolean
}) {
  if (
    env.NODE_ENV === 'production' ||
    !user.isAdmin ||
    seededHandles.has(user.handle)
  ) {
    return
  }

  const [memberships, preferences, sampleUsers, defaultSeedViewer] =
    await Promise.all([
      prisma.discordServerMembership.findMany({
        where: {
          userId: user.id,
        },
        select: {
          serverId: true,
        },
      }),
      prisma.discordServerPreference.findMany({
        where: {
          userId: user.id,
          includeInDiscovery: true,
        },
        select: {
          serverId: true,
        },
      }),
      prisma.user.findMany({
        where: {
          handle: {
            in: [...sampleFriendHandles],
          },
        },
        select: {
          id: true,
        },
      }),
      prisma.user.findUnique({
        where: {
          handle: defaultSeedViewerHandle,
        },
        select: {
          id: true,
        },
      }),
    ])

  const sampleUserIds = sampleUsers.map((sampleUser) => sampleUser.id)

  if (sampleUserIds.length === 0) {
    return
  }

  const membershipServerIds = memberships.map(
    (membership) => membership.serverId,
  )
  const botPresentServerIds =
    await getDiscordBotPresentServerIds(membershipServerIds)
  const selectedServerIdSet = new Set(
    preferences.map((preference) => preference.serverId),
  )
  const selectedRealBotVisibleServerIds = membershipServerIds.filter(
    (serverId) =>
      botPresentServerIds.has(serverId) && selectedServerIdSet.has(serverId),
  )
  const fallbackBotVisibleServerIds = membershipServerIds.filter((serverId) =>
    botPresentServerIds.has(serverId),
  )
  const primaryTargetServerId =
    selectedRealBotVisibleServerIds[0] ?? fallbackBotVisibleServerIds[0] ?? null
  const specificDiscordServerIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: sampleUserIds,
      },
      scope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
    },
    select: {
      id: true,
    },
  })

  if (primaryTargetServerId && specificDiscordServerIntents.length > 0) {
    const specificDiscordServerIntentIds = specificDiscordServerIntents.map(
      (intent) => intent.id,
    )

    await prisma.playIntentTargetDiscordServer.deleteMany({
      where: {
        playIntentId: {
          in: specificDiscordServerIntentIds,
        },
      },
    })

    await prisma.playIntentTargetDiscordServer.createMany({
      data: specificDiscordServerIntentIds.map((playIntentId) => ({
        playIntentId,
        serverId: primaryTargetServerId,
      })),
      skipDuplicates: true,
    })
  }

  const specificFriendIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: sampleUserIds,
      },
      scope: PlayIntentScope.SPECIFIC_FRIENDS,
    },
    select: {
      id: true,
    },
  })

  if (specificFriendIntents.length === 0) {
    return
  }

  const specificFriendIntentIds = specificFriendIntents.map(
    (intent) => intent.id,
  )

  if (defaultSeedViewer?.id) {
    await prisma.playIntentTargetFriend.deleteMany({
      where: {
        playIntentId: {
          in: specificFriendIntentIds,
        },
        friendUserId: defaultSeedViewer.id,
      },
    })
  }

  await prisma.playIntentTargetFriend.createMany({
    data: specificFriendIntentIds.map((playIntentId) => ({
      playIntentId,
      friendUserId: user.id,
    })),
    skipDuplicates: true,
  })
}
