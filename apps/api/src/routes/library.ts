import { Router } from 'express'
import type { Request, Response } from 'express'
import { GameIntentType } from '@prisma/client'
import {
  gameSearchResponseSchema,
  libraryResponseSchema,
  upsertLibraryEntryRequestSchema,
  type CatalogGameMatch,
  type LibraryEntryIntent,
  type LibraryResponse
} from '@game-is-up/shared'
import { z } from 'zod'
import { findOrCreateGameByTitle, findOrCreateGameFromCatalogMatch, searchGamesByTitle } from '../lib/game-catalog.js'
import { prisma } from '../lib/prisma.js'
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
        },
        orderBy: [
          {
            updatedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ]
      }
    }
  })

  return {
    usualAvailability: user?.usualAvailability ?? null,
    entries: (user?.gameInterests ?? []).map((entry) => ({
      id: entry.id,
      gameId: entry.gameId,
      title: entry.game.title,
      platformLabels: entry.platforms.map((platform) => platform.platformLabel),
      intent: toLibraryEntryIntent(entry.intentType),
      ...resolveAvailability(entry.availability, user?.usualAvailability ?? null)
    }))
  }
}

async function resolveGame(catalogMatch: CatalogGameMatch | undefined, title: string) {
  if (catalogMatch) {
    return findOrCreateGameFromCatalogMatch(catalogMatch)
  }

  return findOrCreateGameByTitle(title)
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