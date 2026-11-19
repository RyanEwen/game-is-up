import {
  AuthProvider,
  DiscordActivityType,
  DiscordGameActivityCountKind,
  GameIntentType,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode,
  PrismaClient,
  ProfileVisibility,
} from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

// The seed runs outside the API (no validated env module), so it builds its own client from
// DATABASE_URL, which the prisma:seed script always sets.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000)
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function createInterest(options: {
  userId: string
  gameId: string
  intentType: GameIntentType
  platformLabels: string[]
  availability?: string
}) {
  return prisma.userGameInterest.create({
    data: {
      userId: options.userId,
      gameId: options.gameId,
      intentType: options.intentType,
      availability: options.availability,
      platforms: {
        create: options.platformLabels.map((platformLabel) => ({
          platformLabel,
        })),
      },
    },
  })
}

async function main() {
  await prisma.$transaction([
    prisma.report.deleteMany(),
    prisma.discordAutoPlayPrompt.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.playIntentPlatform.deleteMany(),
    prisma.playIntentGame.deleteMany(),
    prisma.playIntent.deleteMany(),
    prisma.discordObservedGame.deleteMany(),
    prisma.discordGameActivityDaily.deleteMany(),
    prisma.discordActivityObservation.deleteMany(),
    prisma.block.deleteMany(),
    prisma.friend.deleteMany(),
    prisma.discordServerPreference.deleteMany(),
    prisma.discordServerMembership.deleteMany(),
    prisma.discordServer.deleteMany(),
    prisma.userGameInterestPlatform.deleteMany(),
    prisma.userGameInterest.deleteMany(),
    prisma.gamePlatform.deleteMany(),
    prisma.gameAlias.deleteMany(),
    prisma.gameSource.deleteMany(),
    prisma.userIdentity.deleteMany(),
    prisma.game.deleteMany(),
    prisma.user.deleteMany(),
  ])

  const [viewer, mira, jordan, kelsey, noa] = await Promise.all([
    prisma.user.create({
      data: {
        handle: 'technicallyreal',
        displayName: 'Alex Mercer',
        email: 'alex@example.com',
        bio: 'Usually looking for co-op runs, flexible on genre, happy to fill support roles.',
        timezoneId: 'America/New_York',
        usualAvailability: 'Weeknights after 8pm',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: minutesAgo(5),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-alex',
            email: 'alex@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date(),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        handle: 'raidandrelax',
        displayName: 'Mira Santos',
        email: 'mira@example.com',
        bio: 'Prefers chill co-op sessions, weekend raids, and games with good buildcraft.',
        timezoneId: 'America/New_York',
        usualAvailability: 'Weekend afternoons',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: minutesAgo(12),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-mira',
            email: 'mira@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date(),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        handle: 'nightqueue',
        displayName: 'Jordan Lee',
        email: 'jordan@example.com',
        bio: 'Late-night queue partner for shooters, extraction games, and long-form RPG grinds.',
        timezoneId: 'Europe/Paris',
        usualAvailability: 'Late nights',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: hoursAgo(20),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-jordan',
            email: 'jordan@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date(),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        handle: 'supportmain',
        displayName: 'Kelsey Tran',
        email: 'kelsey@example.com',
        bio: 'Usually tanking or healing, always up for one more mission if the vibes are good.',
        timezoneId: 'America/Chicago',
        usualAvailability: 'Most nights after 7pm',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: minutesAgo(18),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-kelsey',
            email: 'kelsey@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date(),
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        handle: 'weekendwizard',
        displayName: 'Noa Kim',
        email: 'noa@example.com',
        bio: 'Likes small-group co-op, long session games, and scheduling plans a little ahead of time.',
        timezoneId: 'America/New_York',
        usualAvailability: 'Weekend mornings and nights',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: minutesAgo(8),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-noa',
            email: 'noa@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date(),
          },
        },
      },
    }),
  ])

  const games = await Promise.all([
    prisma.game.create({
      data: {
        slug: 'sea-of-thieves',
        title: 'Sea of Thieves',
        coverUrl:
          'https://media.rawg.io/media/games/5f6/5f61441e6338e9221f96a8f4c64c7bb8.jpg',
        description: 'Shared-world pirate co-op sandbox.',
        sources: {
          create: { source: 'rawg', externalId: '50781', canonical: true },
        },
        platforms: {
          create: [{ platformLabel: 'Xbox' }, { platformLabel: 'PC' }],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'monster-hunter-wilds',
        title: 'Monster Hunter Wilds',
        coverUrl:
          'https://media.rawg.io/media/games/91b/91b4edd8fecf88b2b5ca0752321382ee.jpg',
        description: 'Co-op hunts with long progression arcs.',
        sources: {
          create: { source: 'rawg', externalId: '973391', canonical: true },
        },
        platforms: {
          create: [
            { platformLabel: 'PC' },
            { platformLabel: 'PlayStation' },
            { platformLabel: 'Xbox' },
          ],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'helldivers-2',
        title: 'Helldivers 2',
        coverUrl:
          'https://media.rawg.io/media/screenshots/d58/d58b2e611e69b02757ffc4fccda8ee74.jpg',
        description: 'Co-op extraction and chaos.',
        sources: {
          create: { source: 'rawg', externalId: '976564', canonical: true },
        },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'apex-legends',
        title: 'Apex Legends',
        coverUrl:
          'https://media.rawg.io/media/games/737/737ea5662211d2e0bbd6f5989189e4f1.jpg',
        description: 'Hero shooter battle royale.',
        sources: {
          create: { source: 'rawg', externalId: '290856', canonical: true },
        },
        platforms: {
          create: [
            { platformLabel: 'PC' },
            { platformLabel: 'Xbox' },
            { platformLabel: 'PlayStation' },
            { platformLabel: 'Switch' },
          ],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'deep-rock-galactic',
        title: 'Deep Rock Galactic',
        coverUrl:
          'https://media.rawg.io/media/games/c92/c9207a31f0eeb9904a840fc26eae6afb.jpg',
        description: 'Co-op mining and horde shooter.',
        sources: {
          create: { source: 'rawg', externalId: '9551', canonical: true },
        },
        platforms: {
          create: [
            { platformLabel: 'PC' },
            { platformLabel: 'Xbox' },
            { platformLabel: 'PlayStation' },
          ],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'destiny-2',
        title: 'Destiny 2',
        coverUrl:
          'https://cdn.cloudflare.steamstatic.com/steam/apps/1085660/header.jpg',
        description:
          'Shared-world looter shooter with raids and ritual playlists.',
        sources: {
          create: { source: 'rawg', externalId: '10213', canonical: true },
        },
        platforms: {
          create: [
            { platformLabel: 'PC' },
            { platformLabel: 'Xbox' },
            { platformLabel: 'PlayStation' },
          ],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'lethal-company',
        title: 'Lethal Company',
        coverUrl:
          'https://cdn.cloudflare.steamstatic.com/steam/apps/1966720/header.jpg',
        description:
          'Scrappy co-op salvage runs where every plan gets worse in voice chat.',
        sources: {
          create: { source: 'rawg', externalId: '269228', canonical: true },
        },
        platforms: { create: [{ platformLabel: 'PC' }] },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'warframe',
        title: 'Warframe',
        coverUrl:
          'https://cdn.cloudflare.steamstatic.com/steam/apps/230410/header.jpg',
        description:
          'Fast co-op looter shooter with endless progression systems.',
        sources: {
          create: { source: 'rawg', externalId: '766', canonical: true },
        },
        platforms: {
          create: [
            { platformLabel: 'PC' },
            { platformLabel: 'Xbox' },
            { platformLabel: 'PlayStation' },
            { platformLabel: 'Switch' },
          ],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'valheim',
        title: 'Valheim',
        coverUrl:
          'https://cdn.cloudflare.steamstatic.com/steam/apps/892970/header.jpg',
        description:
          'Survival crafting with long co-op sessions and boss progression.',
        sources: {
          create: { source: 'rawg', externalId: '442786', canonical: true },
        },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }],
        },
      },
    }),
    prisma.game.create({
      data: {
        slug: 'phasmophobia',
        title: 'Phasmophobia',
        coverUrl:
          'https://cdn.cloudflare.steamstatic.com/steam/apps/739630/header.jpg',
        description:
          'Ghost-hunting co-op that works well for short sessions and voice chat chaos.',
        sources: {
          create: { source: 'rawg', externalId: '370370', canonical: true },
        },
        platforms: { create: [{ platformLabel: 'PC' }] },
      },
    }),
  ])

  const bySlug = Object.fromEntries(games.map((game) => [game.slug, game]))

  await Promise.all([
    createInterest({
      userId: viewer.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['Xbox'],
    }),
    createInterest({
      userId: viewer.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: viewer.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.WISHLIST,
      availability: 'Friday nights',
      platformLabels: ['PC', 'PlayStation'],
    }),
    createInterest({
      userId: viewer.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Most weeknights',
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: viewer.id,
      gameId: bySlug['destiny-2'].id,
      intentType: GameIntentType.PLAYING_NOW,
      availability: 'Tonight',
      platformLabels: ['PC'],
    }),

    createInterest({
      userId: mira.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.PLAYING_NOW,
      availability: 'Tonight',
      platformLabels: ['Xbox'],
    }),
    createInterest({
      userId: mira.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC', 'PlayStation'],
    }),
    createInterest({
      userId: mira.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Friday after 9pm',
      platformLabels: ['PC', 'PlayStation'],
    }),
    createInterest({
      userId: mira.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC'],
    }),

    createInterest({
      userId: jordan.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Saturday nights',
      platformLabels: ['PC', 'Xbox'],
    }),
    createInterest({
      userId: jordan.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.WISHLIST,
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: jordan.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: jordan.id,
      gameId: bySlug['apex-legends'].id,
      intentType: GameIntentType.PLAYING_NOW,
      availability: 'Late-night stacks',
      platformLabels: ['PC', 'Xbox'],
    }),
    createInterest({
      userId: jordan.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Weekend evenings',
      platformLabels: ['PC', 'Xbox'],
    }),

    createInterest({
      userId: kelsey.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'After dinner',
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: kelsey.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.PLAYING_NOW,
      availability: 'Right now',
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: kelsey.id,
      gameId: bySlug['destiny-2'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['Xbox'],
    }),
    createInterest({
      userId: kelsey.id,
      gameId: bySlug['lethal-company'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC'],
    }),

    createInterest({
      userId: noa.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['Xbox'],
    }),
    createInterest({
      userId: noa.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC'],
    }),
    createInterest({
      userId: noa.id,
      gameId: bySlug['destiny-2'].id,
      intentType: GameIntentType.INTERESTED,
      platformLabels: ['PC', 'Xbox'],
    }),
    createInterest({
      userId: noa.id,
      gameId: bySlug['lethal-company'].id,
      intentType: GameIntentType.WISHLIST,
      platformLabels: ['PC'],
    }),
  ])

  await prisma.friend.createMany({
    data: [
      { userId: viewer.id, friendedUserId: mira.id },
      { userId: viewer.id, friendedUserId: jordan.id },
      { userId: viewer.id, friendedUserId: noa.id },
      { userId: mira.id, friendedUserId: viewer.id },
      { userId: jordan.id, friendedUserId: viewer.id },
      { userId: noa.id, friendedUserId: viewer.id },
    ],
  })

  const [coopCorner, lateQueue, weekendRaid] = await Promise.all([
    prisma.discordServer.create({
      data: { id: 'discord-server-coop-corner', name: 'Co-op Corner' },
    }),
    prisma.discordServer.create({
      data: { id: 'discord-server-late-queue', name: 'Late Queue' },
    }),
    prisma.discordServer.create({
      data: { id: 'discord-server-weekend-raid', name: 'Weekend Raid Club' },
    }),
  ])

  await prisma.discordServerMembership.createMany({
    data: [
      { userId: viewer.id, serverId: coopCorner.id },
      { userId: viewer.id, serverId: lateQueue.id },
      { userId: viewer.id, serverId: weekendRaid.id },
      { userId: mira.id, serverId: coopCorner.id },
      { userId: mira.id, serverId: weekendRaid.id },
      { userId: jordan.id, serverId: lateQueue.id },
      { userId: kelsey.id, serverId: coopCorner.id },
      { userId: noa.id, serverId: coopCorner.id },
      { userId: noa.id, serverId: lateQueue.id },
    ],
  })

  await prisma.discordServerPreference.createMany({
    data: [
      { userId: viewer.id, serverId: coopCorner.id, includeInDiscovery: true },
      { userId: viewer.id, serverId: lateQueue.id, includeInDiscovery: true },
      { userId: viewer.id, serverId: weekendRaid.id, includeInDiscovery: true },
      { userId: mira.id, serverId: coopCorner.id, includeInDiscovery: true },
      { userId: mira.id, serverId: weekendRaid.id, includeInDiscovery: true },
      { userId: jordan.id, serverId: lateQueue.id, includeInDiscovery: true },
      { userId: kelsey.id, serverId: coopCorner.id, includeInDiscovery: true },
      { userId: noa.id, serverId: coopCorner.id, includeInDiscovery: true },
      { userId: noa.id, serverId: lateQueue.id, includeInDiscovery: true },
    ],
  })

  const libraryWideIntent = await prisma.playIntent.create({
    data: {
      userId: mira.id,
      selectionMode: PlayIntentSelectionMode.ENTIRE_LIBRARY,
      headline: 'Open to anything in my library tonight',
      note: 'Prefer co-op or survival games after 8pm.',
      scope: PlayIntentScope.FRIENDS_ONLY,
      windowStartsAt: hoursFromNow(1),
      windowEndsAt: hoursFromNow(5),
      expiresAt: hoursFromNow(5),
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }],
      },
    },
  })

  const networkSubsetIntent = await prisma.playIntent.create({
    data: {
      userId: jordan.id,
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      headline: 'Picked a shorter list for the weekend',
      note: 'Looking for 2-3 people who are fine with voice chat.',
      scope: PlayIntentScope.MUTUAL_FRIENDS,
      windowStartsAt: hoursFromNow(24),
      windowEndsAt: hoursFromNow(30),
      expiresAt: hoursFromNow(30),
      platforms: { create: [{ platformLabel: 'PC' }] },
      games: {
        create: [
          { gameId: bySlug['helldivers-2'].id },
          { gameId: bySlug['monster-hunter-wilds'].id },
          { gameId: bySlug['deep-rock-galactic'].id },
        ],
      },
    },
  })

  const serverScopedIntent = await prisma.playIntent.create({
    data: {
      userId: kelsey.id,
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      headline: 'Co-op Corner only tonight',
      note: 'Keeping this one to the Co-op Corner regulars.',
      scope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
      targetDiscordServers: {
        create: [{ serverId: coopCorner.id }],
      },
      windowStartsAt: hoursFromNow(2),
      windowEndsAt: hoursFromNow(6),
      expiresAt: hoursFromNow(6),
      platforms: { create: [{ platformLabel: 'PC' }] },
      games: {
        create: [
          { gameId: bySlug['deep-rock-galactic'].id },
          { gameId: bySlug['helldivers-2'].id },
        ],
      },
    },
  })

  const specificFriendsIntent = await prisma.playIntent.create({
    data: {
      userId: noa.id,
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      headline: 'Saving this one for a smaller group',
      note: 'Mostly looking for Alex and Mira if either is around.',
      scope: PlayIntentScope.SPECIFIC_FRIENDS,
      windowStartsAt: hoursFromNow(4),
      windowEndsAt: hoursFromNow(8),
      expiresAt: hoursFromNow(8),
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }],
      },
      games: {
        create: [
          { gameId: bySlug['sea-of-thieves'].id },
          { gameId: bySlug['deep-rock-galactic'].id },
        ],
      },
      targetFriends: {
        create: [{ friendUserId: viewer.id }, { friendUserId: mira.id }],
      },
    },
  })

  await prisma.notification.createMany({
    data: [
      {
        userId: viewer.id,
        triggeredByUserId: mira.id,
        playIntentId: libraryWideIntent.id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Mira is looking to play tonight',
        body: 'Mira opened up her library for a chill session tonight.',
        deliveredAt: minutesAgo(15),
        respondedAt: minutesAgo(9),
        responseChoice: NotificationResponseChoice.JOIN,
      },
      {
        userId: viewer.id,
        triggeredByUserId: jordan.id,
        playIntentId: networkSubsetIntent.id,
        gameId: bySlug['helldivers-2'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Jordan scheduled a weekend run',
        body: 'Jordan picked a few games for the weekend and thought you might overlap.',
        deliveredAt: minutesAgo(25),
      },
      {
        userId: noa.id,
        triggeredByUserId: jordan.id,
        playIntentId: networkSubsetIntent.id,
        gameId: bySlug['deep-rock-galactic'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Jordan scheduled a weekend run',
        body: 'Jordan picked a few games for the weekend and thought you might overlap.',
        deliveredAt: minutesAgo(25),
        respondedAt: minutesAgo(10),
        responseChoice: NotificationResponseChoice.JOIN,
      },
      {
        userId: viewer.id,
        triggeredByUserId: kelsey.id,
        playIntentId: serverScopedIntent.id,
        gameId: bySlug['deep-rock-galactic'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Kelsey posted to Co-op Corner',
        body: 'Kelsey narrowed this call to play down to Co-op Corner tonight.',
        deliveredAt: minutesAgo(20),
      },
      {
        userId: mira.id,
        triggeredByUserId: kelsey.id,
        playIntentId: serverScopedIntent.id,
        gameId: bySlug['helldivers-2'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Kelsey posted to Co-op Corner',
        body: 'Kelsey narrowed this call to play down to Co-op Corner tonight.',
        deliveredAt: minutesAgo(20),
        respondedAt: minutesAgo(6),
        responseChoice: NotificationResponseChoice.JOIN,
      },
      {
        userId: noa.id,
        triggeredByUserId: kelsey.id,
        playIntentId: serverScopedIntent.id,
        gameId: bySlug['deep-rock-galactic'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Kelsey posted to Co-op Corner',
        body: 'Kelsey narrowed this call to play down to Co-op Corner tonight.',
        deliveredAt: minutesAgo(19),
        respondedAt: minutesAgo(4),
        responseChoice: NotificationResponseChoice.JOIN,
      },
      {
        userId: mira.id,
        triggeredByUserId: noa.id,
        playIntentId: specificFriendsIntent.id,
        gameId: bySlug['deep-rock-galactic'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Noa saved a smaller session for you',
        body: 'Noa only sent this one to a couple of friends.',
        deliveredAt: minutesAgo(5),
        respondedAt: minutesAgo(2),
        responseChoice: NotificationResponseChoice.JOIN,
      },
      {
        userId: viewer.id,
        triggeredByUserId: noa.id,
        playIntentId: specificFriendsIntent.id,
        gameId: bySlug['sea-of-thieves'].id,
        type: NotificationType.FRIEND_PLAYING,
        title: 'Noa saved a smaller session for you',
        body: 'Noa only sent this one to a couple of friends.',
        deliveredAt: minutesAgo(5),
      },
    ],
  })

  await prisma.discordActivityObservation.createMany({
    data: [
      {
        userId: mira.id,
        gameId: bySlug['monster-hunter-wilds'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Monster Hunter Wilds',
        applicationId: 'discord-app-mhw',
        activityType: DiscordActivityType.COMPETING,
        details: 'Event hunt',
        firstObservedAt: hoursAgo(2),
        lastObservedAt: minutesAgo(10),
        isActive: true,
      },
      {
        userId: kelsey.id,
        gameId: bySlug['deep-rock-galactic'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Deep Rock Galactic',
        applicationId: 'discord-app-drg',
        activityType: DiscordActivityType.PLAYING,
        details: 'Hazard 4 run',
        firstObservedAt: hoursAgo(1),
        lastObservedAt: minutesAgo(6),
        isActive: true,
      },
      {
        userId: jordan.id,
        gameId: bySlug['apex-legends'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Apex Legends',
        applicationId: 'discord-app-apex',
        activityType: DiscordActivityType.PLAYING,
        details: 'Ranked queue',
        firstObservedAt: hoursAgo(3),
        lastObservedAt: minutesAgo(4),
        isActive: true,
      },
    ],
  })

  await prisma.discordObservedGame.createMany({
    data: [
      {
        userId: viewer.id,
        gameId: bySlug['apex-legends'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Apex Legends',
        applicationId: 'discord-app-apex',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(3),
        lastObservedAt: minutesAgo(90),
      },
      {
        userId: viewer.id,
        gameId: bySlug['deep-rock-galactic'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Deep Rock Galactic',
        applicationId: 'discord-app-drg',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(5),
        lastObservedAt: hoursAgo(26),
      },
      {
        userId: viewer.id,
        gameId: bySlug['monster-hunter-wilds'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Monster Hunter Wilds',
        applicationId: 'discord-app-mhw',
        activityType: DiscordActivityType.COMPETING,
        firstObservedAt: hoursAgo(6),
        lastObservedAt: hoursAgo(2),
      },
      {
        userId: viewer.id,
        gameId: bySlug['lethal-company'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Lethal Company',
        applicationId: 'discord-app-lethal-company',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(2),
        lastObservedAt: hoursAgo(8),
      },
      {
        userId: viewer.id,
        gameId: bySlug['warframe'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Warframe',
        applicationId: 'discord-app-warframe',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(6),
        lastObservedAt: hoursAgo(12),
      },
      {
        userId: viewer.id,
        gameId: bySlug['valheim'].id,
        sourceServerId: weekendRaid.id,
        activityName: 'Valheim',
        applicationId: 'discord-app-valheim',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(4),
        lastObservedAt: hoursAgo(16),
      },
      {
        userId: viewer.id,
        gameId: bySlug['phasmophobia'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Phasmophobia',
        applicationId: 'discord-app-phasmophobia',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(1),
        lastObservedAt: minutesAgo(35),
      },
      {
        userId: mira.id,
        gameId: bySlug['helldivers-2'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Helldivers 2',
        applicationId: 'discord-app-helldivers-2',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: hoursAgo(8),
        lastObservedAt: minutesAgo(18),
      },
      {
        userId: mira.id,
        gameId: bySlug['monster-hunter-wilds'].id,
        sourceServerId: weekendRaid.id,
        activityName: 'Monster Hunter Wilds',
        applicationId: 'discord-app-mhw',
        activityType: DiscordActivityType.COMPETING,
        firstObservedAt: daysAgo(2),
        lastObservedAt: hoursAgo(6),
      },
      {
        userId: mira.id,
        gameId: bySlug['destiny-2'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Destiny 2',
        applicationId: 'discord-app-destiny-2',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(4),
        lastObservedAt: hoursAgo(10),
      },
      {
        userId: jordan.id,
        gameId: bySlug['apex-legends'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Apex Legends',
        applicationId: 'discord-app-apex',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(1),
        lastObservedAt: minutesAgo(7),
      },
      {
        userId: jordan.id,
        gameId: bySlug['helldivers-2'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Helldivers 2',
        applicationId: 'discord-app-helldivers-2',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(3),
        lastObservedAt: hoursAgo(14),
      },
      {
        userId: jordan.id,
        gameId: bySlug['lethal-company'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Lethal Company',
        applicationId: 'discord-app-lethal-company',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(2),
        lastObservedAt: minutesAgo(55),
      },
      {
        userId: noa.id,
        gameId: bySlug['deep-rock-galactic'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Deep Rock Galactic',
        applicationId: 'discord-app-drg',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(2),
        lastObservedAt: minutesAgo(32),
      },
      {
        userId: noa.id,
        gameId: bySlug['sea-of-thieves'].id,
        sourceServerId: weekendRaid.id,
        activityName: 'Sea of Thieves',
        applicationId: 'discord-app-sea-of-thieves',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: daysAgo(5),
        lastObservedAt: hoursAgo(9),
      },
      {
        userId: noa.id,
        gameId: bySlug['monster-hunter-wilds'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Monster Hunter Wilds',
        applicationId: 'discord-app-mhw',
        activityType: DiscordActivityType.COMPETING,
        firstObservedAt: daysAgo(1),
        lastObservedAt: hoursAgo(3),
      },
    ],
  })

  // A member who never signed up is counted only anonymously, per game, server and day.
  await prisma.discordGameActivityDaily.create({
    data: {
      gameId: bySlug['lethal-company'].id,
      serverId: weekendRaid.id,
      day: new Date(new Date().toISOString().slice(0, 10)),
      countKind: DiscordGameActivityCountKind.OBSERVATIONS,
      count: 3,
    },
  })

  console.log(
    `Seeded ${5} sample users, ${games.length} games, and ${3} Discord servers.`,
  )
  console.log(
    `Sample account ${viewer.handle} now has ${5} library entries, ${3} friends, and ${4} seeded play intents to inspect.`,
  )
  console.log(
    'Added live Discord activity, friend observed-game history for trending suggestions, and seeded join responses so admins can test richer call-to-play states.',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
