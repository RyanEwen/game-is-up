import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getAuthSession } from '../lib/session.js'

const friendParamsSchema = z.object({
  userId: z.string().uuid()
})

export const friendsRouter = Router()

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

friendsRouter.post('/:userId', async (request, response, next) => {
  const viewerUserId = requireSignedInUserId(request, response)

  if (!viewerUserId) {
    return
  }

  try {
    const { userId } = friendParamsSchema.parse(request.params)

    if (userId === viewerUserId) {
      response.status(400).json({
        error: 'You cannot add yourself as a friend.'
      })
      return
    }

    const targetUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true
      }
    })

    if (!targetUser) {
      response.status(404).json({
        error: 'User not found.'
      })
      return
    }

    await prisma.friend.upsert({
      where: {
        userId_friendedUserId: {
          userId: viewerUserId,
          friendedUserId: userId
        }
      },
      update: {},
      create: {
        userId: viewerUserId,
        friendedUserId: userId
      }
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

friendsRouter.delete('/:userId', async (request, response, next) => {
  const viewerUserId = requireSignedInUserId(request, response)

  if (!viewerUserId) {
    return
  }

  try {
    const { userId } = friendParamsSchema.parse(request.params)

    await prisma.friend.deleteMany({
      where: {
        userId: viewerUserId,
        friendedUserId: userId
      }
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})