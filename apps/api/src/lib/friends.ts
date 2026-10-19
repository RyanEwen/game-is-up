/** One-way app follow mutations shared by HTTP routes and private Discord panels. */
import { publishDashboardInvalidation } from './dashboard-events.js'
import { RecordChangedError } from './mutation-conflict.js'
import { prisma } from './prisma.js'

export class FriendValidationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** Add an existing app user; discovery eligibility is enforced by the caller's surface. */
export async function addFriend(viewerUserId: string, userId: string) {
  if (userId === viewerUserId) {
    throw new FriendValidationError('You cannot add yourself as a friend.', 400)
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!target) {
    throw new FriendValidationError('User not found.', 404)
  }
  await prisma.friend.upsert({
    where: { userId_friendedUserId: { userId: viewerUserId, friendedUserId: userId } },
    update: {},
    create: { userId: viewerUserId, friendedUserId: userId }
  })
  invalidateFriends(viewerUserId)
}

/** Remove a directional app follow, including when it has already been removed. */
export async function removeFriend(viewerUserId: string, userId: string) {
  await prisma.friend.deleteMany({ where: { userId: viewerUserId, friendedUserId: userId } })
  invalidateFriends(viewerUserId)
}

/** Remove the exact owned follow shown in a confirmation; a later refollow has a different id. */
export async function removeOwnedFriend(userId: string, followId: string) {
  const deleted = await prisma.friend.deleteMany({ where: { id: followId, userId } })
  if (deleted.count === 0) {
    throw new RecordChangedError('That follow changed or was removed. Open My friends before removing it again.')
  }
  invalidateFriends(userId)
}

function invalidateFriends(userId: string) {
  publishDashboardInvalidation({ domains: ['network', 'discovery', 'play-intents'], userIds: [userId] })
}
