/**
 * Startup maintenance pass that consolidates duplicate `Game` rows.
 *
 * Older title-decoration splits (e.g. trademark suffix variants) can leave
 * separate rows that should collapse to a single canonical title. This module
 * picks a canonical row using catalog source preference, reference counts,
 * and decoration cleanliness, then migrates dependent interests,
 * notifications, and observations onto the canonical row before retiring the
 * duplicates.
 */

import { GameIntentType } from '@prisma/client'
import { normalizeGameTitleForMatch } from './game-catalog.js'
import { prisma } from './prisma.js'

const gameIntentPriority: Record<GameIntentType, number> = {
  COMPLETED: 0,
  WISHLIST: 1,
  INTERESTED: 2,
  PLAYING_NOW: 3
}

function gameTitleDecorationPenalty(title: string) {
  return (title.match(/[™®©]/g) ?? []).length * 10
    + (title.match(/[^\w\s]/g) ?? []).length
}

function choosePreferredIntent(left: GameIntentType, right: GameIntentType) {
  return gameIntentPriority[left] >= gameIntentPriority[right] ? left : right
}

function choosePreferredAvailability(left: string | null, right: string | null) {
  return left?.trim() ? left : right?.trim() ? right : null
}

function choosePreferredTitleGame(
  left: {
    id: string;
    title: string;
    createdAt: Date;
    sources: Array<{ canonical: boolean }>;
    _count: {
      interests: number;
      playIntentGames: number;
      notifications: number;
      discordActivityObservations: number;
      observedOnDiscord: number;
      autoPlayPrompts: number;
    };
  },
  right: {
    id: string;
    title: string;
    createdAt: Date;
    sources: Array<{ canonical: boolean }>;
    _count: {
      interests: number;
      playIntentGames: number;
      notifications: number;
      discordActivityObservations: number;
      observedOnDiscord: number;
      autoPlayPrompts: number;
    };
  }
) {
  const leftCanonicalSources = left.sources.filter((source) => source.canonical).length
  const rightCanonicalSources = right.sources.filter((source) => source.canonical).length

  if (leftCanonicalSources !== rightCanonicalSources) {
    return leftCanonicalSources > rightCanonicalSources ? left : right
  }

  if (left.sources.length !== right.sources.length) {
    return left.sources.length > right.sources.length ? left : right
  }

  const leftDecorationPenalty = gameTitleDecorationPenalty(left.title)
  const rightDecorationPenalty = gameTitleDecorationPenalty(right.title)

  if (leftDecorationPenalty !== rightDecorationPenalty) {
    return leftDecorationPenalty < rightDecorationPenalty ? left : right
  }

  const leftReferenceCount = left._count.interests
    + left._count.playIntentGames
    + left._count.notifications
    + left._count.discordActivityObservations
    + left._count.observedOnDiscord
    + left._count.autoPlayPrompts
  const rightReferenceCount = right._count.interests
    + right._count.playIntentGames
    + right._count.notifications
    + right._count.discordActivityObservations
    + right._count.observedOnDiscord
    + right._count.autoPlayPrompts

  if (leftReferenceCount !== rightReferenceCount) {
    return leftReferenceCount > rightReferenceCount ? left : right
  }

  return left.createdAt <= right.createdAt ? left : right
}

async function mergeUserGameInterests(preferredGameId: string, duplicateGameId: string) {
  const duplicateInterests = await prisma.userGameInterest.findMany({
    where: {
      gameId: duplicateGameId
    },
    include: {
      platforms: {
        select: {
          platformLabel: true
        }
      }
    }
  })

  const preferredInterestsByUserId = new Map(
    (await prisma.userGameInterest.findMany({
      where: {
        gameId: preferredGameId,
        userId: {
          in: duplicateInterests.map((interest) => interest.userId)
        }
      },
      include: {
        platforms: {
          select: {
            platformLabel: true
          }
        }
      }
    })).map((interest) => [interest.userId, interest])
  )

  for (const duplicateInterest of duplicateInterests) {
    const preferredInterest = preferredInterestsByUserId.get(duplicateInterest.userId)

    if (!preferredInterest) {
      await prisma.userGameInterest.update({
        where: {
          id: duplicateInterest.id
        },
        data: {
          gameId: preferredGameId
        }
      })
      continue
    }

    await prisma.userGameInterest.update({
      where: {
        id: preferredInterest.id
      },
      data: {
        intentType: choosePreferredIntent(preferredInterest.intentType, duplicateInterest.intentType),
        availability: choosePreferredAvailability(preferredInterest.availability, duplicateInterest.availability)
      }
    })

    const missingPlatformLabels = duplicateInterest.platforms
      .map((platform) => platform.platformLabel)
      .filter((platformLabel) => !preferredInterest.platforms.some((platform) => platform.platformLabel === platformLabel))

    if (missingPlatformLabels.length > 0) {
      await prisma.userGameInterestPlatform.createMany({
        data: missingPlatformLabels.map((platformLabel) => ({
          userGameInterestId: preferredInterest.id,
          platformLabel
        })),
        skipDuplicates: true
      })
    }

    await prisma.userGameInterest.delete({
      where: {
        id: duplicateInterest.id
      }
    })
  }
}

async function mergeUserGameAliases(preferredGameId: string, duplicateGameId: string) {
  const duplicateAliases = await prisma.userGameAlias.findMany({
    where: {
      gameId: duplicateGameId
    }
  })

  const preferredAliasesByUserId = new Map(
    (await prisma.userGameAlias.findMany({
      where: {
        gameId: preferredGameId,
        userId: {
          in: duplicateAliases.map((alias) => alias.userId)
        }
      }
    })).map((alias) => [alias.userId, alias])
  )

  for (const duplicateAlias of duplicateAliases) {
    const preferredAlias = preferredAliasesByUserId.get(duplicateAlias.userId)

    if (!preferredAlias) {
      await prisma.userGameAlias.update({
        where: {
          id: duplicateAlias.id
        },
        data: {
          gameId: preferredGameId
        }
      })
      continue
    }

    if (!preferredAlias.aliasValue.trim() && duplicateAlias.aliasValue.trim()) {
      await prisma.userGameAlias.update({
        where: {
          id: preferredAlias.id
        },
        data: {
          aliasValue: duplicateAlias.aliasValue
        }
      })
    }

    await prisma.userGameAlias.delete({
      where: {
        id: duplicateAlias.id
      }
    })
  }
}

async function mergePlayIntentGames(preferredGameId: string, duplicateGameId: string) {
  const duplicatePlayIntentGames = await prisma.playIntentGame.findMany({
    where: {
      gameId: duplicateGameId
    }
  })

  const playIntentIds = duplicatePlayIntentGames.map((entry) => entry.playIntentId)
  const preferredPlayIntentIds = new Set((await prisma.playIntentGame.findMany({
    where: {
      gameId: preferredGameId,
      playIntentId: {
        in: playIntentIds
      }
    },
    select: {
      playIntentId: true
    }
  })).map((entry) => entry.playIntentId))

  for (const duplicatePlayIntentGame of duplicatePlayIntentGames) {
    if (preferredPlayIntentIds.has(duplicatePlayIntentGame.playIntentId)) {
      await prisma.playIntentGame.delete({
        where: {
          id: duplicatePlayIntentGame.id
        }
      })
      continue
    }

    await prisma.playIntentGame.update({
      where: {
        id: duplicatePlayIntentGame.id
      },
      data: {
        gameId: preferredGameId
      }
    })
  }
}

async function mergeObservedDiscordGames(preferredGameId: string, duplicateGameId: string) {
  const duplicateObservedGames = await prisma.discordObservedGame.findMany({
    where: {
      gameId: duplicateGameId
    }
  })

  const preferredObservedGamesByDiscordUserId = new Map(
    (await prisma.discordObservedGame.findMany({
      where: {
        gameId: preferredGameId,
        discordUserId: {
          in: duplicateObservedGames.map((entry) => entry.discordUserId)
        }
      }
    })).map((entry) => [entry.discordUserId, entry])
  )

  for (const duplicateObservedGame of duplicateObservedGames) {
    const preferredObservedGame = preferredObservedGamesByDiscordUserId.get(duplicateObservedGame.discordUserId)

    if (!preferredObservedGame) {
      await prisma.discordObservedGame.update({
        where: {
          id: duplicateObservedGame.id
        },
        data: {
          gameId: preferredGameId
        }
      })
      continue
    }

    const duplicateIsMoreRecent = duplicateObservedGame.lastObservedAt > preferredObservedGame.lastObservedAt

    await prisma.discordObservedGame.update({
      where: {
        id: preferredObservedGame.id
      },
      data: {
        activityName: duplicateIsMoreRecent ? duplicateObservedGame.activityName : preferredObservedGame.activityName,
        applicationId: duplicateIsMoreRecent ? duplicateObservedGame.applicationId : preferredObservedGame.applicationId,
        activityType: duplicateIsMoreRecent ? duplicateObservedGame.activityType : preferredObservedGame.activityType,
        sourceServerId: duplicateIsMoreRecent ? duplicateObservedGame.sourceServerId : preferredObservedGame.sourceServerId,
        firstObservedAt: duplicateObservedGame.firstObservedAt < preferredObservedGame.firstObservedAt
          ? duplicateObservedGame.firstObservedAt
          : preferredObservedGame.firstObservedAt,
        lastObservedAt: duplicateIsMoreRecent ? duplicateObservedGame.lastObservedAt : preferredObservedGame.lastObservedAt
      }
    })

    await prisma.discordObservedGame.delete({
      where: {
        id: duplicateObservedGame.id
      }
    })
  }
}

async function mergeGameIntoPreferred(preferredGameId: string, duplicateGameId: string) {
  const [preferredGame, duplicateGame] = await Promise.all([
    prisma.game.findUnique({
      where: {
        id: preferredGameId
      }
    }),
    prisma.game.findUnique({
      where: {
        id: duplicateGameId
      },
      include: {
        aliases: {
          select: {
            alias: true
          }
        },
        platforms: {
          select: {
            platformLabel: true
          }
        }
      }
    })
  ])

  if (!preferredGame || !duplicateGame || preferredGame.id === duplicateGame.id) {
    return false
  }

  const aliasesToCreate = [...new Set([
    duplicateGame.title,
    ...duplicateGame.aliases.map((alias) => alias.alias)
  ])]
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0 && alias.toLowerCase() !== preferredGame.title.trim().toLowerCase())

  if (aliasesToCreate.length > 0) {
    await prisma.gameAlias.createMany({
      data: aliasesToCreate.map((alias) => ({
        gameId: preferredGameId,
        alias
      })),
      skipDuplicates: true
    })
  }

  if (duplicateGame.platforms.length > 0) {
    await prisma.gamePlatform.createMany({
      data: duplicateGame.platforms.map((platform) => ({
        gameId: preferredGameId,
        platformLabel: platform.platformLabel
      })),
      skipDuplicates: true
    })
  }

  if ((!preferredGame.coverUrl && duplicateGame.coverUrl) || (!preferredGame.description && duplicateGame.description)) {
    await prisma.game.update({
      where: {
        id: preferredGameId
      },
      data: {
        coverUrl: preferredGame.coverUrl ?? duplicateGame.coverUrl,
        description: preferredGame.description ?? duplicateGame.description
      }
    })
  }

  await mergeUserGameInterests(preferredGameId, duplicateGameId)
  await mergeUserGameAliases(preferredGameId, duplicateGameId)
  await mergePlayIntentGames(preferredGameId, duplicateGameId)
  await mergeObservedDiscordGames(preferredGameId, duplicateGameId)

  await prisma.gameSource.updateMany({
    where: {
      gameId: duplicateGameId
    },
    data: {
      gameId: preferredGameId
    }
  })

  await prisma.notification.updateMany({
    where: {
      gameId: duplicateGameId
    },
    data: {
      gameId: preferredGameId
    }
  })

  await prisma.discordActivityObservation.updateMany({
    where: {
      gameId: duplicateGameId
    },
    data: {
      gameId: preferredGameId
    }
  })

  await prisma.discordAutoPlayPrompt.updateMany({
    where: {
      gameId: duplicateGameId
    },
    data: {
      gameId: preferredGameId
    }
  })

  await prisma.game.delete({
    where: {
      id: duplicateGameId
    }
  })

  return true
}

export async function repairNormalizedDuplicateGames() {
  const games = await prisma.game.findMany({
    select: {
      id: true,
      title: true,
      createdAt: true,
      sources: {
        select: {
          canonical: true
        }
      },
      _count: {
        select: {
          interests: true,
          playIntentGames: true,
          notifications: true,
          discordActivityObservations: true,
          observedOnDiscord: true,
          autoPlayPrompts: true
        }
      }
    }
  })

  const gamesByNormalizedTitle = new Map<string, typeof games>()

  for (const game of games) {
    const normalizedTitle = normalizeGameTitleForMatch(game.title)

    if (!normalizedTitle) {
      continue
    }

    const existingGames = gamesByNormalizedTitle.get(normalizedTitle) ?? []
    existingGames.push(game)
    gamesByNormalizedTitle.set(normalizedTitle, existingGames)
  }

  let mergedGameCount = 0
  let mergedGroupCount = 0

  for (const duplicateGroup of gamesByNormalizedTitle.values()) {
    if (duplicateGroup.length < 2) {
      continue
    }

    const preferredGame = duplicateGroup.reduce((preferred, candidate) => choosePreferredTitleGame(preferred, candidate))
    let groupChanged = false

    for (const duplicateGame of duplicateGroup) {
      if (duplicateGame.id === preferredGame.id) {
        continue
      }

      if (await mergeGameIntoPreferred(preferredGame.id, duplicateGame.id)) {
        mergedGameCount += 1
        groupChanged = true
      }
    }

    if (groupChanged) {
      mergedGroupCount += 1
    }
  }

  return {
    mergedGameCount,
    mergedGroupCount
  }
}