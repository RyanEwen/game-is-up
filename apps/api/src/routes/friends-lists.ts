/**
 * `/api/friends-lists` — CRUD for reusable, user-owned friends lists that can
 * be chosen as the audience for a call to play.
 *
 * Every endpoint is scoped to the signed-in user; list ownership is enforced in
 * the `lib/friends-lists.ts` service layer. Membership is always validated
 * against the caller's current friend graph.
 */

import { Router } from 'express'
import { z } from 'zod'
import {
  deleteFriendsListResponseSchema,
  friendsListResponseSchema,
  friendsListsResponseSchema,
  upsertFriendsListRequestSchema,
} from '@game-is-up/shared'
import {
  FriendsListValidationError,
  createFriendsList,
  deleteFriendsList,
  getFriendsListsForUser,
  updateFriendsList,
} from '../lib/friends-lists.js'
import { requireSignedInUserId } from '../lib/route-auth.js'

export const friendsListsRouter = Router()

const friendsListParamSchema = z.object({ listId: z.string().uuid() })

function handleValidationError(
  error: unknown,
  response: import('express').Response,
): boolean {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: error.issues[0]?.message ?? 'Invalid friends list payload.',
    })
    return true
  }

  if (error instanceof FriendsListValidationError) {
    response.status(400).json({ error: error.message })
    return true
  }

  return false
}

friendsListsRouter.get('/', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(
      friendsListsResponseSchema.parse({
        lists: await getFriendsListsForUser(userId),
      }),
    )
  } catch (error) {
    next(error)
  }
})

friendsListsRouter.post('/', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const payload = upsertFriendsListRequestSchema.parse(request.body)
    const list = await createFriendsList(
      userId,
      payload.name,
      payload.friendUserIds,
    )

    response.status(201).json(friendsListResponseSchema.parse({ list }))
  } catch (error) {
    if (handleValidationError(error, response)) {
      return
    }

    next(error)
  }
})

friendsListsRouter.put('/:listId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { listId } = friendsListParamSchema.parse(request.params)
    const payload = upsertFriendsListRequestSchema.parse(request.body)
    const list = await updateFriendsList(
      userId,
      listId,
      payload.name,
      payload.friendUserIds,
    )

    response.json(friendsListResponseSchema.parse({ list }))
  } catch (error) {
    if (handleValidationError(error, response)) {
      return
    }

    next(error)
  }
})

friendsListsRouter.delete('/:listId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { listId } = friendsListParamSchema.parse(request.params)
    const deleted = await deleteFriendsList(userId, listId)

    response.json(
      deleteFriendsListResponseSchema.parse({
        status: deleted ? 'deleted' : 'missing',
        message: deleted
          ? 'Friends list deleted.'
          : 'That friends list no longer exists.',
      }),
    )
  } catch (error) {
    if (handleValidationError(error, response)) {
      return
    }

    next(error)
  }
})
