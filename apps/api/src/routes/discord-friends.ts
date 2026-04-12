import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  discordFriendsResponseSchema,
  importDiscordFriendsRequestSchema,
  importDiscordFriendsResponseSchema
} from '@game-is-up/shared'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fetchDiscordUser } from '../lib/discord-auth.js'
import { listDiscordFriendsForUser, replaceDiscordRelationshipsForUser } from '../lib/discord-relationships.js'
import { getAuthSession } from '../lib/session.js'

export const discordFriendsRouter = Router()

const meParamsSchema = z.object({
  subject: z.literal('me')
})

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

async function resolveViewerUserIdFromDiscordAccessToken(request: Request): Promise<string | null> {
  const authorizationHeader = request.header('Authorization')

  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  const accessToken = authorizationHeader.slice('Bearer '.length).trim()

  if (!accessToken) {
    return null
  }

  try {
    const profile = await fetchDiscordUser(accessToken)
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'DISCORD',
          providerUserId: profile.id
        }
      },
      select: {
        userId: true,
        grantedScopes: true
      }
    })

    if (!identity || !identity.grantedScopes.includes('relationships.read')) {
      return null
    }

    return identity.userId
  } catch {
    return null
  }
}

async function requireImportUserId(request: Request, response: Response): Promise<string | null> {
  const sessionUserId = getAuthSession(request)?.userId ?? null

  if (sessionUserId) {
    return sessionUserId
  }

  const viewerUserId = await resolveViewerUserIdFromDiscordAccessToken(request)

  if (!viewerUserId) {
    response.status(401).json({
      error: 'Authentication required. Sign in with Discord or provide an embedded Discord access token.'
    })
    return null
  }

  return viewerUserId
}

discordFriendsRouter.get('/:subject', async (request, response, next) => {
  const viewerUserId = requireSignedInUserId(request, response)

  if (!viewerUserId) {
    return
  }

  try {
    meParamsSchema.parse(request.params)
    const payload = await listDiscordFriendsForUser(viewerUserId)
    response.json(discordFriendsResponseSchema.parse(payload))
  } catch (error) {
    next(error)
  }
})

discordFriendsRouter.post('/:subject/import', async (request, response, next) => {
  const viewerUserId = await requireImportUserId(request, response)

  if (!viewerUserId) {
    return
  }

  try {
    meParamsSchema.parse(request.params)
    const discordIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: viewerUserId,
        provider: 'DISCORD'
      },
      select: {
        grantedScopes: true
      }
    })

    if (!discordIdentity) {
      response.status(400).json({
        error: 'Sign in with Discord before importing Discord friends.'
      })
      return
    }

    if (!discordIdentity.grantedScopes.includes('relationships.read')) {
      response.status(403).json({
        error: 'This Discord connection has not granted relationships.read.'
      })
      return
    }

    const payload = importDiscordFriendsRequestSchema.parse(request.body)
    const syncedAt = await replaceDiscordRelationshipsForUser(viewerUserId, payload.friends)

    response.json(importDiscordFriendsResponseSchema.parse({
      importedCount: payload.friends.length,
      syncedAt: syncedAt.toISOString()
    }))
  } catch (error) {
    next(error)
  }
})