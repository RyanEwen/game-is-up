/**
 * `/api/friends` — one-way follow links between app users.
 *
 * The product model uses directional favorites rather than mutual friendship,
 * so an upsert-based add and a delete-based remove keep the schema simple.
 * Both endpoints publish a dashboard invalidation so the viewer's other tabs
 * (and the followed user's discovery rank) refresh promptly.
 */

import { Router } from 'express'
import { z } from 'zod'
import {
  addFriend,
  removeFriend,
  FriendValidationError,
} from '../lib/friends.js'
import { requireSignedInUserId } from '../lib/route-auth.js'

const friendParamsSchema = z.object({
  userId: z.string().uuid(),
})

export const friendsRouter = Router()

friendsRouter.post('/:userId', async (request, response, next) => {
  const viewerUserId = requireSignedInUserId(request, response)

  if (!viewerUserId) {
    return
  }

  try {
    const { userId } = friendParamsSchema.parse(request.params)

    await addFriend(viewerUserId, userId)

    response.status(204).send()
  } catch (error) {
    if (error instanceof FriendValidationError) {
      response.status(error.status).json({ error: error.message })
      return
    }
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

    await removeFriend(viewerUserId, userId)

    response.status(204).send()
  } catch (error) {
    if (error instanceof FriendValidationError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    next(error)
  }
})
