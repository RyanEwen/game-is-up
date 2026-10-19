/**
 * `/api/library` — the viewer's game library + catalog lookups + Steam import.
 *
 * Owns CRUD for library entries, catalog search delegating to the configured
 * provider (RAWG today), per-entry game-details lookups, and the Steam owned-
 * games import preview/commit flow. Library writes also backfill notification
 * rows for any still-active calls to play that newly apply to the viewer.
 */

import { Router } from 'express'
import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import {
  gameDetailsResponseSchema,
  gameSearchResponseSchema,
  importSteamLibrarySelectionRequestSchema,
  libraryResponseSchema,
  steamLibraryImportPreviewResponseSchema,
  upsertLibraryEntryRequestSchema,
  type ImportSteamLibrarySelectionRequest
} from '@game-is-up/shared'
import { z } from 'zod'
import {
  findOrCreateGameFromSteamImport,
  normalizeGameTitleForMatch,
  searchGamesByTitle
} from '../lib/game-catalog.js'
import { getGameDetails } from '../lib/game-details.js'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { backfillPlayIntentNotificationsForUserLibraryChange } from '../lib/play-intents.js'
import { prisma } from '../lib/prisma.js'
import { fetchSteamOwnedGames, fetchSteamProfileSummary, isSteamImportConfigured } from '../lib/steam-auth.js'
import { buildLibraryResponse, writeLibraryGame, upsertLibraryEntry, removeLibraryEntry } from '../lib/library.js'
import { requireSignedInUserId } from '../lib/route-auth.js'

const libraryEntryParamsSchema = z.object({
  entryId: z.string().uuid()
})

const libraryCatalogQuerySchema = z.object({
  query: z.string().trim().max(80).default('')
})

const libraryCatalogDetailsParamsSchema = z.object({
  source: z.string().trim().min(1).max(32),
  sourceId: z.string().trim().min(1).max(96)
})

export const libraryRouter = Router()

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
    const resolvedGame = await findOrCreateGameFromSteamImport({
      sourceId: game.sourceId,
      title: game.title,
      coverUrl: game.coverUrl,
      platformLabels
    })

    await writeLibraryGame(userId, resolvedGame.id, {
      title: resolvedGame.title.slice(0, 80),
      platformLabels,
      intent: selection.intent,
      availability: selection.availability
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

libraryRouter.get('/catalog/:source/:sourceId/details', async (request, response, next) => {
  try {
    const { source, sourceId } = libraryCatalogDetailsParamsSchema.parse(request.params)
    response.json(gameDetailsResponseSchema.parse({
      game: await getGameDetails(source, sourceId)
    }))
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
    await upsertLibraryEntry(userId, payload)

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
    await backfillPlayIntentNotificationsForUserLibraryChange(userId)

    publishDashboardInvalidation({
      domains: ['library', 'discovery', 'play-intents']
    })

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
    if (!await removeLibraryEntry(userId, entryId)) {
      response.status(404).json({ error: 'Library entry not found.' })
      return
    }

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})