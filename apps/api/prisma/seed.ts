import {
  AuthProvider,
  DiscordActivityType,
  GameIntentType,
  PlayIntentScope,
  PlayIntentSelectionMode,
  PrismaClient,
  ProfileVisibility
} from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction([
    prisma.report.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.playIntentPlatform.deleteMany(),
    prisma.playIntentGame.deleteMany(),
    prisma.playIntent.deleteMany(),
    prisma.discordObservedGame.deleteMany(),
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
    prisma.user.deleteMany()
  ])

  const [viewer, mira, jordan] = await Promise.all([
    prisma.user.create({
      data: {
        handle: 'partyfinder',
        displayName: 'Alex Mercer',
        email: 'alex@example.com',
        bio: 'Usually looking for co-op runs, flexible on genre, happy to fill support roles.',
        timezoneId: 'America/New_York',
        usualAvailability: 'Weeknights after 8pm',
        visibility: ProfileVisibility.FRIENDS_ONLY,
        lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-alex',
            email: 'alex@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date()
          }
        }
      }
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
        lastSeenAt: new Date(Date.now() - 12 * 60 * 1000),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-mira',
            email: 'mira@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date()
          }
        }
      }
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
        lastSeenAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        identities: {
          create: {
            provider: AuthProvider.DISCORD,
            providerUserId: 'discord-jordan',
            email: 'jordan@example.com',
            grantedScopes: ['email', 'guilds', 'identify'],
            lastDiscordGuildsSyncAt: new Date()
          }
        }
      }
    })
  ])

  const games = await Promise.all([
    prisma.game.create({
      data: {
        slug: 'sea-of-thieves',
        title: 'Sea of Thieves',
        coverUrl: 'https://media.rawg.io/media/games/5f6/5f61441e6338e9221f96a8f4c64c7bb8.jpg',
        description: 'Shared-world pirate co-op sandbox.',
        sources: { create: { source: 'rawg', externalId: '50781', canonical: true } },
        platforms: {
          create: [{ platformLabel: 'Xbox' }, { platformLabel: 'PC' }]
        }
      }
    }),
    prisma.game.create({
      data: {
        slug: 'monster-hunter-wilds',
        title: 'Monster Hunter Wilds',
        coverUrl: 'https://media.rawg.io/media/games/91b/91b4edd8fecf88b2b5ca0752321382ee.jpg',
        description: 'Co-op hunts with long progression arcs.',
        sources: { create: { source: 'rawg', externalId: '973391', canonical: true } },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }, { platformLabel: 'Xbox' }]
        }
      }
    }),
    prisma.game.create({
      data: {
        slug: 'helldivers-2',
        title: 'Helldivers 2',
        coverUrl: 'https://media.rawg.io/media/screenshots/d58/d58b2e611e69b02757ffc4fccda8ee74.jpg',
        description: 'Co-op extraction and chaos.',
        sources: { create: { source: 'rawg', externalId: '976564', canonical: true } },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }]
        }
      }
    }),
    prisma.game.create({
      data: {
        slug: 'apex-legends',
        title: 'Apex Legends',
        coverUrl: 'https://media.rawg.io/media/games/737/737ea5662211d2e0bbd6f5989189e4f1.jpg',
        description: 'Hero shooter battle royale.',
        sources: { create: { source: 'rawg', externalId: '290856', canonical: true } },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }, { platformLabel: 'PlayStation' }, { platformLabel: 'Switch' }]
        }
      }
    }),
    prisma.game.create({
      data: {
        slug: 'deep-rock-galactic',
        title: 'Deep Rock Galactic',
        coverUrl: 'https://media.rawg.io/media/games/c92/c9207a31f0eeb9904a840fc26eae6afb.jpg',
        description: 'Co-op mining and horde shooter.',
        sources: { create: { source: 'rawg', externalId: '9551', canonical: true } },
        platforms: {
          create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }, { platformLabel: 'PlayStation' }]
        }
      }
    })
  ])

  const bySlug = Object.fromEntries(games.map((game) => [game.slug, game]))

  await prisma.userGameInterest.create({
    data: {
      userId: viewer.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.INTERESTED,
      platforms: {
        create: [{ platformLabel: 'Xbox' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: viewer.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.INTERESTED,
      platforms: {
        create: [{ platformLabel: 'PC' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: viewer.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.WISHLIST,
      availability: 'Friday nights',
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: mira.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.PLAYING_NOW,
      availability: 'Tonight',
      platforms: {
        create: [{ platformLabel: 'Xbox' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: mira.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.INTERESTED,
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: mira.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Friday after 9pm',
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'PlayStation' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: jordan.id,
      gameId: bySlug['sea-of-thieves'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Saturday nights',
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: jordan.id,
      gameId: bySlug['monster-hunter-wilds'].id,
      intentType: GameIntentType.WISHLIST,
      platforms: {
        create: [{ platformLabel: 'PC' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: jordan.id,
      gameId: bySlug['helldivers-2'].id,
      intentType: GameIntentType.INTERESTED,
      platforms: {
        create: [{ platformLabel: 'PC' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: jordan.id,
      gameId: bySlug['apex-legends'].id,
      intentType: GameIntentType.WISHLIST,
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }]
      }
    }
  })

  await prisma.userGameInterest.create({
    data: {
      userId: jordan.id,
      gameId: bySlug['deep-rock-galactic'].id,
      intentType: GameIntentType.INTERESTED,
      availability: 'Weekend evenings',
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }]
      }
    }
  })

  await prisma.friend.createMany({
    data: [
      {
        userId: viewer.id,
        friendedUserId: mira.id
      },
      {
        userId: viewer.id,
        friendedUserId: jordan.id
      },
      {
        userId: jordan.id,
        friendedUserId: viewer.id
      }
    ]
  })

  const [coopCorner, lateQueue] = await Promise.all([
    prisma.discordServer.create({
      data: {
        id: 'discord-server-coop-corner',
        name: 'Co-op Corner'
      }
    }),
    prisma.discordServer.create({
      data: {
        id: 'discord-server-late-queue',
        name: 'Late Queue'
      }
    })
  ])

  await prisma.discordServerMembership.createMany({
    data: [
      {
        userId: viewer.id,
        serverId: coopCorner.id
      },
      {
        userId: viewer.id,
        serverId: lateQueue.id
      },
      {
        userId: mira.id,
        serverId: coopCorner.id
      },
      {
        userId: jordan.id,
        serverId: lateQueue.id
      }
    ]
  })

  await prisma.discordServerPreference.createMany({
    data: [
      {
        userId: viewer.id,
        serverId: coopCorner.id,
        includeInDiscovery: true
      },
      {
        userId: viewer.id,
        serverId: lateQueue.id,
        includeInDiscovery: true
      },
      {
        userId: mira.id,
        serverId: coopCorner.id,
        includeInDiscovery: true
      },
      {
        userId: jordan.id,
        serverId: lateQueue.id,
        includeInDiscovery: true
      }
    ]
  })

  const libraryWideIntent = await prisma.playIntent.create({
    data: {
      userId: mira.id,
      selectionMode: PlayIntentSelectionMode.ENTIRE_LIBRARY,
      headline: 'Open to anything in my library tonight',
      note: 'Prefer co-op or survival games after 8pm.',
      scope: PlayIntentScope.FRIENDS_ONLY,
      windowStartsAt: new Date(Date.now() + 60 * 60 * 1000),
      windowEndsAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
      platforms: {
        create: [{ platformLabel: 'PC' }, { platformLabel: 'Xbox' }]
      }
    }
  })

  const subsetIntent = await prisma.playIntent.create({
    data: {
      userId: jordan.id,
      selectionMode: PlayIntentSelectionMode.SELECTED_GAMES,
      headline: 'Picked a shorter list for the weekend',
      note: 'Looking for 2-3 people who are fine with voice chat.',
      scope: PlayIntentScope.MUTUAL_FRIENDS,
      windowStartsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      windowEndsAt: new Date(Date.now() + 30 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000),
      platforms: {
        create: [{ platformLabel: 'PC' }]
      }
    }
  })

  await prisma.playIntentGame.createMany({
    data: [
      {
        playIntentId: subsetIntent.id,
        gameId: bySlug['helldivers-2'].id
      },
      {
        playIntentId: subsetIntent.id,
        gameId: bySlug['monster-hunter-wilds'].id
      },
      {
        playIntentId: subsetIntent.id,
        gameId: bySlug['deep-rock-galactic'].id
      }
    ]
  })

  await prisma.discordObservedGame.createMany({
    data: [
      {
        discordUserId: 'discord-alex',
        gameId: bySlug['apex-legends'].id,
        sourceServerId: lateQueue.id,
        activityName: 'Apex Legends',
        applicationId: 'discord-app-apex',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        lastObservedAt: new Date(Date.now() - 90 * 60 * 1000)
      },
      {
        discordUserId: 'discord-alex',
        gameId: bySlug['deep-rock-galactic'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Deep Rock Galactic',
        applicationId: 'discord-app-drg',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        lastObservedAt: new Date(Date.now() - 26 * 60 * 60 * 1000)
      },
      {
        discordUserId: 'discord-alex',
        gameId: bySlug['monster-hunter-wilds'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Monster Hunter Wilds',
        applicationId: 'discord-app-mhw',
        activityType: DiscordActivityType.COMPETING,
        firstObservedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        lastObservedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        discordUserId: 'discord-mystery-friend',
        gameId: bySlug['deep-rock-galactic'].id,
        sourceServerId: coopCorner.id,
        activityName: 'Deep Rock Galactic',
        applicationId: 'discord-app-drg',
        activityType: DiscordActivityType.PLAYING,
        firstObservedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        lastObservedAt: new Date(Date.now() - 30 * 60 * 1000)
      }
    ]
  })

  console.log(`Seeded viewer ${viewer.handle} with ${games.length} games and 2 candidate users.`)
  console.log(`Created play intents ${libraryWideIntent.headline} and ${subsetIntent.headline}.`)
  console.log('Seeded observed Discord suggestions for the default viewer.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })