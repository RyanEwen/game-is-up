import { Router } from 'express'
import { z } from 'zod'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { prisma } from '../lib/prisma.js'
import { requireSignedInUserId } from '../lib/route-auth.js'

const friendParamsSchema = z.object({
  userId: z.string().uuid()
})

export const friendsRouter = Router()

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

    publishDashboardInvalidation({
      domains: ['network', 'discovery', 'play-intents'],
      userIds: [viewerUserId]
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

    publishDashboardInvalidation({
      domains: ['network', 'discovery', 'play-intents'],
      userIds: [viewerUserId]
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})