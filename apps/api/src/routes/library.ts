import { Router } from 'express'
import type { Request, Response } from 'express'
import { AuthProvider as PrismaAuthProvider, GameIntentType } from '@prisma/client'
import {
  gameSearchResponseSchema,
  importSteamLibrarySelectionRequestSchema,
  libraryResponseSchema,
  steamLibraryImportPreviewResponseSchema,
  upsertLibraryEntryRequestSchema,
  type CatalogGameMatch,
  type ImportSteamLibrarySelectionRequest,
  type LibraryEntryIntent,
  type LibraryResponse
} from '@game-is-up/shared'
import { z } from 'zod'
import {
  findOrCreateGameByTitle,
  findOrCreateGameFromCatalogMatch,
  findOrCreateGameFromSteamImport,
  normalizeGameTitleForMatch,
  searchGamesByTitle
} from '../lib/game-catalog.js'
import { toClientGameCoverUrl } from '../lib/game-media.js'
import { getNetworkTrendingGames, getObservedLibrarySuggestions } from '../lib/library-suggestions.js'
import { prisma } from '../lib/prisma.js'
import { fetchSteamOwnedGames, fetchSteamProfileSummary, isSteamImportConfigured } from '../lib/steam-auth.js'
import { getAuthSession } from '../lib/session.js'
import { resolveAvailability } from '../lib/availability.js'

const libraryEntryParamsSchema = z.object({
  entryId: z.string().uuid()
})

const libraryCatalogQuerySchema = z.object({
  query: z.string().trim().max(80).default('')
})

export const libraryRouter = Router()

function requireSignedInUserId(request: Request, response: Response): string | null {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return null
  }

  return session.userId
}

function toLibraryEntryIntent(intentType: GameIntentType): LibraryEntryIntent {
  switch (intentType) {
    case GameIntentType.WISHLIST:
      return 'wishlist'
    case GameIntentType.PLAYING_NOW:
      return 'playing-now'
    default:
      return 'interested'
  }
}

function toPrismaIntentType(intent: LibraryEntryIntent): GameIntentType {
  switch (intent) {
    case 'wishlist':
      return GameIntentType.WISHLIST
    case 'playing-now':
      return GameIntentType.PLAYING_NOW
    default:
      return GameIntentType.INTERESTED
  }
}

async function buildLibraryResponse(userId: string): Promise<LibraryResponse> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      usualAvailability: true,
      gameInterests: {
        where: {
          intentType: {
            not: GameIntentType.COMPLETED
          }
        },
        include: {
          game: true,
          platforms: {
            orderBy: {
              platformLabel: 'asc'
            }
          }
        }
      }
    }
  })

  const entries = (user?.gameInterests ?? [])
    .map((entry) => ({
      id: entry.id,
      gameId: entry.gameId,
      title: entry.game.title,
      coverUrl: toClientGameCoverUrl(entry.game.coverUrl),
      platformLabels: entry.platforms.map((platform) => platform.platformLabel),
      intent: toLibraryEntryIntent(entry.intentType),
      ...resolveAvailability(entry.availability, user?.usualAvailability ?? null)
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
  const entryGameIds = entries.map((entry) => entry.gameId)
  const [suggestedGames, trendingGames] = await Promise.all([
    getObservedLibrarySuggestions(userId, entryGameIds),
    getNetworkTrendingGames(userId, entryGameIds)
  ])

  return {
    usualAvailability: user?.usualAvailability ?? null,
    entries,
    suggestedGames,
    trendingGames
  }
}

async function resolveGame(catalogMatch: CatalogGameMatch | undefined, title: string) {
  if (catalogMatch) {
    return findOrCreateGameFromCatalogMatch(catalogMatch)
  }

  return findOrCreateGameByTitle(title)
}

function compareSteamImportPreviewGames(
  left: { alreadyInLibrary: boolean; title: string; sourceId: string },
  right: { alreadyInLibrary: boolean; title: string; sourceId: string }
): number {
  if (left.alreadyInLibrary !== right.alreadyInLibrary) {
    return Number(left.alreadyInLibrary) - Number(right.alreadyInLibrary)
  }

  const titleOrder = left.title.localeCompare(right.title, undefined, {
    numeric: true,
    sensitivity: 'base'
  })

  if (titleOrder !== 0) {
    return titleOrder
  }

  return left.sourceId.localeCompare(right.sourceId)
}

async function getSteamIdentityForUser(userId: string) {
  return prisma.userIdentity.findFirst({
    where: {
      userId,
      provider: PrismaAuthProvider.STEAM
    },
    select: {
      providerUserId: true
    }
  })
}

async function loadSteamImportPreview(userId: string) {
  const steamIdentity = await getSteamIdentityForUser(userId)

  if (!steamIdentity) {
    return steamLibraryImportPreviewResponseSchema.parse({
      status: 'not-linked',
      note: 'Connect a Steam account first to preview your owned games.',
      account: null,
      games: []
    })
  }

  const [account, ownedGames, existingEntries] = await Promise.all([
    fetchSteamProfileSummary(steamIdentity.providerUserId),
    fetchSteamOwnedGames(steamIdentity.providerUserId),
    prisma.userGameInterest.findMany({
      where: {
        userId
      },
      select: {
        game: {
          select: {
            title: true,
            sources: {
              select: {
                source: true,
                externalId: true
              }
            }
          }
        }
      }
    })
  ])

  const existingSteamSourceIds = new Set(
    existingEntries.flatMap((entry) => entry.game.sources)
      .filter((source) => source.source === 'steam')
      .map((source) => source.externalId)
  )
  const existingTitles = new Set(existingEntries.map((entry) => normalizeGameTitleForMatch(entry.game.title)))
  const games = ownedGames.map((game) => ({
    ...game,
    alreadyInLibrary: existingSteamSourceIds.has(game.sourceId) || existingTitles.has(normalizeGameTitleForMatch(game.title))
  })).sort(compareSteamImportPreviewGames)

  if (games.length === 0) {
    return steamLibraryImportPreviewResponseSchema.parse({
      status: 'unavailable',
      note: 'Steam did not return any importable games. The library may be private or empty.',
      account,
      games: []
    })
  }

  return steamLibraryImportPreviewResponseSchema.parse({
    status: 'ready',
    note: null,
    account,
    games
  })
}

async function importSteamGamesForUser(userId: string, selections: ImportSteamLibrarySelectionRequest['games']) {
  const steamIdentity = await getSteamIdentityForUser(userId)

  if (!steamIdentity) {
    throw new Error('Connect a Steam account before importing games.')
  }

  const ownedGames = await fetchSteamOwnedGames(steamIdentity.providerUserId)
  const selectionBySourceId = new Map(selections.map((selection) => [selection.sourceId, selection]))
  const selectedGames = ownedGames.filter((game) => selectionBySourceId.has(game.sourceId))

  if (selectedGames.length === 0) {
    throw new Error('Steam did not return any of the selected games. Refresh the import list and try again.')
  }

  for (const game of selectedGames) {
    const selection = selectionBySourceId.get(game.sourceId)

    if (!selection) {
      continue
    }

    const platformLabels = [...new Set(selection.platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    const availability = selection.availability?.trim() ? selection.availability.trim() : null
    const resolvedGame = await findOrCreateGameFromSteamImport({
      sourceId: game.sourceId,
      title: game.title,
      coverUrl: game.coverUrl,
      platformLabels
    })

    await prisma.$transaction(async (transaction) => {
      const interest = await transaction.userGameInterest.upsert({
        where: {
          userId_gameId: {
            userId,
            gameId: resolvedGame.id
          }
        },
        update: {
          intentType: toPrismaIntentType(selection.intent),
          availability
        },
        create: {
          userId,
          gameId: resolvedGame.id,
          intentType: toPrismaIntentType(selection.intent),
          availability
        }
      })

      await transaction.userGameInterestPlatform.deleteMany({
        where: {
          userGameInterestId: interest.id
        }
      })

      await transaction.userGameInterestPlatform.createMany({
        data: platformLabels.map((platformLabel) => ({
          userGameInterestId: interest.id,
          platformLabel
        }))
      })
    })
  }
}

libraryRouter.get('/catalog', async (request, response, next) => {
  try {
    const { query } = libraryCatalogQuerySchema.parse(request.query)
    const results = await searchGamesByTitle(query)
    response.json(
      gameSearchResponseSchema.parse({
        results
      })
    )
  } catch (error) {
    next(error)
  }
})

libraryRouter.get('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(libraryResponseSchema.parse(await buildLibraryResponse(userId)))
  } catch (error) {
    next(error)
  }
})

libraryRouter.get('/imports/steam', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  if (!isSteamImportConfigured()) {
    response.status(503).json({
      error: 'Steam import is not configured.'
    })
    return
  }

  try {
    response.json(await loadSteamImportPreview(userId))
  } catch (error) {
    next(error)
  }
})

libraryRouter.post('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const payload = upsertLibraryEntryRequestSchema.parse(request.body)
    const game = await resolveGame(payload.catalogMatch, payload.title)
    const availability = payload.availability?.trim() ? payload.availability.trim() : null
    const platformLabels = [...new Set(payload.platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]

    await prisma.$transaction(async (transaction) => {
      const interest = await transaction.userGameInterest.upsert({
        where: {
          userId_gameId: {
            userId,
            gameId: game.id
          }
        },
        update: {
          intentType: toPrismaIntentType(payload.intent),
          availability
        },
        create: {
          userId,
          gameId: game.id,
          intentType: toPrismaIntentType(payload.intent),
          availability
        }
      })

      await transaction.userGameInterestPlatform.deleteMany({
        where: {
          userGameInterestId: interest.id
        }
      })

      await transaction.userGameInterestPlatform.createMany({
        data: platformLabels.map((platformLabel) => ({
          userGameInterestId: interest.id,
          platformLabel
        }))
      })
    })

    response.json(libraryResponseSchema.parse(await buildLibraryResponse(userId)))
  } catch (error) {
    next(error)
  }
})

libraryRouter.post('/imports/steam', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  if (!isSteamImportConfigured()) {
    response.status(503).json({
      error: 'Steam import is not configured.'
    })
    return
  }

  try {
    const payload = importSteamLibrarySelectionRequestSchema.parse(request.body)

    await importSteamGamesForUser(userId, payload.games)

    response.json(libraryResponseSchema.parse(await buildLibraryResponse(userId)))
  } catch (error) {
    next(error)
  }
})

libraryRouter.delete('/me/:entryId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { entryId } = libraryEntryParamsSchema.parse(request.params)
    const deleted = await prisma.userGameInterest.deleteMany({
      where: {
        id: entryId,
        userId
      }
    })

    if (deleted.count === 0) {
      response.status(404).json({
        error: 'Library entry not found.'
      })
      return
    }

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})