/** HTTP boundaries for participant friend invitations; service logic owns authorization and eligibility. */
import { Router, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import {
  playIntentFriendInviteRequestSchema,
  playIntentFriendInviteResponseSchema,
  playIntentInvitableFriendsResponseSchema,
} from '@game-is-up/shared'
import { requireSignedInUserId } from '../lib/route-auth.js'
import { PlayIntentNotificationResponseError } from '../lib/play-intent-notification-responses.js'
import {
  getPlayIntentInvitableFriends,
  inviteFriendToPlayIntent,
} from '../lib/play-intent-friend-invites.js'
import { sendError } from '../lib/http-error.js'
import { notificationLimit } from '../lib/rate-limits.js'

export const playIntentFriendInviteRouter = Router()
const playIntentParamSchema = z.object({ playIntentId: z.string().uuid() })

/** Maps expected permission, eligibility, and malformed-request failures to HTTP responses. */
function handleInviteError(
  error: unknown,
  response: Response,
  next: NextFunction,
) {
  if (error instanceof PlayIntentNotificationResponseError) {
    response.status(error.statusCode).json({ error: error.message })
  } else if (error instanceof z.ZodError) {
    sendError(
      response,
      400,
      'Invalid invitation request. Choose exactly one friend.',
    )
  } else {
    next(error)
  }
}

/** Both invitation endpoints delegate permission and eligibility checks to the shared service. */
playIntentFriendInviteRouter.get(
  '/:playIntentId/invitable-friends',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)
    if (!userId) {
      return
    }
    try {
      const { playIntentId } = playIntentParamSchema.parse(request.params)
      const friends = await getPlayIntentInvitableFriends(playIntentId, userId)
      response.json(playIntentInvitableFriendsResponseSchema.parse({ friends }))
    } catch (error) {
      handleInviteError(error, response, next)
    }
  },
)

playIntentFriendInviteRouter.post(
  '/:playIntentId/friend-invites',
  notificationLimit,
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)
    if (!userId) {
      return
    }
    try {
      const { playIntentId } = playIntentParamSchema.parse(request.params)
      const { friendUserId } = playIntentFriendInviteRequestSchema.parse(
        request.body,
      )
      const result = await inviteFriendToPlayIntent(
        playIntentId,
        userId,
        friendUserId,
      )
      response.json(playIntentFriendInviteResponseSchema.parse(result))
    } catch (error) {
      handleInviteError(error, response, next)
    }
  },
)
