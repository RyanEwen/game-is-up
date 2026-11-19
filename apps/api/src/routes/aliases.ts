/**
 * `/api/aliases` — user-defined display overrides.
 *
 * Platforms: per-user, per-platform handles (e.g. Steam name, Xbox gamertag)
 * surfaced wherever we render the platform-specific identity for that user.
 * Games: per-user preferred title for a specific game in their library, used
 * to override the canonical catalog title in lists and Discord embeds.
 *
 * Both kinds use upsert semantics keyed by `(userId, platform)` and
 * `(userId, gameId)` respectively, with `deleteMany` clearing an alias.
 */

import { Router } from 'express'
import { z } from 'zod'
import {
  upsertUserGameAliasRequestSchema,
  upsertUserPlatformAliasRequestSchema,
  userGameAliasesResponseSchema,
  userPlatformAliasesResponseSchema,
} from '@game-is-up/shared'
import { prisma } from '../lib/prisma.js'
import { requireSignedInUserId } from '../lib/route-auth.js'
import { sendError } from '../lib/http-error.js'

export const aliasesRouter = Router()

const knownPlatforms = [
  'xbox',
  'psn',
  'steam',
  'epic',
  'nintendo',
  'battlenet',
  'ubisoft',
  'ea',
  'gog',
  'itch',
] as const
const platformParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(
    (value) => /^[a-z0-9_-]+$/.test(value),
    'Platform identifier must be lowercase alphanumeric with hyphens or underscores.',
  )

const gameIdParamSchema = z.object({ gameId: z.uuid() })

// GET /api/aliases/platforms
aliasesRouter.get('/platforms', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const aliases = await prisma.userPlatformAlias.findMany({
      where: { userId },
      orderBy: { platform: 'asc' },
      select: { id: true, platform: true, aliasValue: true },
    })

    response.json(userPlatformAliasesResponseSchema.parse({ aliases }))
  } catch (error) {
    next(error)
  }
})

// PUT /api/aliases/platforms/:platform
aliasesRouter.put('/platforms/:platform', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const platformParse = platformParamSchema.safeParse(request.params.platform)

  if (!platformParse.success) {
    sendError(
      response,
      400,
      platformParse.error.issues[0]?.message ?? 'Invalid platform.',
    )
    return
  }

  const platform = platformParse.data

  try {
    const payload = upsertUserPlatformAliasRequestSchema.parse(request.body)

    const alias = await prisma.userPlatformAlias.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, aliasValue: payload.aliasValue },
      update: { aliasValue: payload.aliasValue },
      select: { id: true, platform: true, aliasValue: true },
    })

    response.json(userPlatformAliasesResponseSchema.parse({ aliases: [alias] }))
  } catch (error) {
    next(error)
  }
})

// DELETE /api/aliases/platforms/:platform
aliasesRouter.delete(
  '/platforms/:platform',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const platformParse = platformParamSchema.safeParse(request.params.platform)

    if (!platformParse.success) {
      sendError(
        response,
        400,
        platformParse.error.issues[0]?.message ?? 'Invalid platform.',
      )
      return
    }

    const platform = platformParse.data

    try {
      await prisma.userPlatformAlias.deleteMany({
        where: { userId, platform },
      })

      response.json({ deleted: true })
    } catch (error) {
      next(error)
    }
  },
)

// GET /api/aliases/games
aliasesRouter.get('/games', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const aliases = await prisma.userGameAlias.findMany({
      where: { userId },
      orderBy: { game: { title: 'asc' } },
      select: {
        id: true,
        gameId: true,
        aliasValue: true,
        game: { select: { title: true } },
      },
    })

    response.json(
      userGameAliasesResponseSchema.parse({
        aliases: aliases.map((alias) => ({
          id: alias.id,
          gameId: alias.gameId,
          gameTitle: alias.game.title,
          aliasValue: alias.aliasValue,
        })),
      }),
    )
  } catch (error) {
    next(error)
  }
})

// PUT /api/aliases/games/:gameId
aliasesRouter.put('/games/:gameId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = gameIdParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    sendError(response, 400, 'Invalid game ID.')
    return
  }

  const { gameId } = paramsParse.data

  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, title: true },
    })

    if (!game) {
      sendError(response, 404, 'Game not found.')
      return
    }

    const payload = upsertUserGameAliasRequestSchema.parse(request.body)

    const alias = await prisma.userGameAlias.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId, aliasValue: payload.aliasValue },
      update: { aliasValue: payload.aliasValue },
      select: { id: true, gameId: true, aliasValue: true },
    })

    response.json(
      userGameAliasesResponseSchema.parse({
        aliases: [
          {
            id: alias.id,
            gameId: alias.gameId,
            gameTitle: game.title,
            aliasValue: alias.aliasValue,
          },
        ],
      }),
    )
  } catch (error) {
    next(error)
  }
})

// DELETE /api/aliases/games/:gameId
aliasesRouter.delete('/games/:gameId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = gameIdParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    sendError(response, 400, 'Invalid game ID.')
    return
  }

  const { gameId } = paramsParse.data

  try {
    await prisma.userGameAlias.deleteMany({
      where: { userId, gameId },
    })

    response.json({ deleted: true })
  } catch (error) {
    next(error)
  }
})

export { knownPlatforms }
