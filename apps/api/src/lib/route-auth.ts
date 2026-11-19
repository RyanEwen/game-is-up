import type { Request, Response } from 'express'
import { prisma } from './prisma.js'
import { getAuthSession } from './session.js'
import { sendError } from './http-error.js'

/**
 * Resolve the current user's id from the signed session cookie, or send a 401
 * response and return null when no valid session is present. Route handlers
 * should bail out (`return`) when this returns null.
 */
export function requireSignedInUserId(
  request: Request,
  response: Response,
): string | null {
  const session = getAuthSession(request)

  if (!session) {
    sendError(response, 401, 'Authentication required.')
    return null
  }

  return session.userId
}

/**
 * Look up just the admin flag for a user. Returns null when the user does not
 * exist. Callers are responsible for emitting the 403 response when the result
 * is null or `isAdmin` is false.
 */
export async function getUserAdminStatus(
  userId: string,
): Promise<{ isAdmin: boolean } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })
}
