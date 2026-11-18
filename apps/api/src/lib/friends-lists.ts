/**
 * Friends-list service layer.
 *
 * Friends lists are reusable, user-owned named audiences that can be selected
 * when composing a call to play. A list only ever references people the owner
 * has already added as friends; membership is filtered against the current
 * friend graph on every read and write so a removed friend silently drops out
 * of any list that still references them.
 *
 * Lists are a convenience for selecting recipients. When a call to play uses a
 * list as its audience the membership is snapshotted into the play intent at
 * save time (see `lib/play-intents.ts`); editing or deleting a list afterwards
 * never changes an already-sent call.
 */

import {
  maximumFriendsListMemberCount,
  upsertFriendsListRequestSchema,
  type FriendsList,
} from '@game-is-up/shared'
import { publishDashboardInvalidation } from './dashboard-events.js'
import { nextRecordUpdatedAt, RecordChangedError } from './mutation-conflict.js'
import { prisma } from './prisma.js'
import { toClientAvatarUrl } from './game-media.js'

export class FriendsListValidationError extends Error {}

/** Refresh both list-management and call-audience consumers after a list mutation. */
function invalidateFriendsLists(userId: string) {
  publishDashboardInvalidation({
    domains: ['network', 'play-intents'],
    userIds: [userId],
  })
}

const friendsListInclude = {
  members: {
    include: {
      friendUser: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  },
} as const

interface FriendsListRecord {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
  members: Array<{
    friendUserId: string
    friendUser: {
      id: string
      handle: string
      displayName: string
      avatarUrl: string | null
    }
  }>
}

/**
 * Serialize a friends-list record, keeping only members who are still friends
 * of the owner. `friendUserIdSet` is the owner's current friend graph.
 */
function serializeFriendsList(
  list: FriendsListRecord,
  friendUserIdSet: Set<string>,
): FriendsList {
  const members = list.members
    .filter((member) => friendUserIdSet.has(member.friendUserId))
    .map((member) => ({
      id: member.friendUser.id,
      handle: member.friendUser.handle,
      displayName: member.friendUser.displayName,
      avatarUrl: toClientAvatarUrl(member.friendUser.avatarUrl),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  return {
    id: list.id,
    name: list.name,
    memberCount: members.length,
    members,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  }
}

async function getFriendUserIdSet(userId: string): Promise<Set<string>> {
  const friends = await prisma.friend.findMany({
    where: { userId },
    select: { friendedUserId: true },
  })

  return new Set(friends.map((friend) => friend.friendedUserId))
}

/** List every friends list owned by the user, newest first. */
export async function getFriendsListsForUser(
  userId: string,
): Promise<FriendsList[]> {
  const [lists, friendUserIdSet] = await Promise.all([
    prisma.friendsList.findMany({
      where: { userId },
      include: friendsListInclude,
      orderBy: { createdAt: 'desc' },
    }),
    getFriendUserIdSet(userId),
  ])

  return lists.map((list) => serializeFriendsList(list, friendUserIdSet))
}

/**
 * Resolve the requested member ids to the owner's current friends, throwing if
 * any id is not a friend. Returns the deduplicated, validated id list.
 */
function resolveListMemberIds(
  requestedIds: string[],
  friendUserIdSet: Set<string>,
): string[] {
  const uniqueIds = [...new Set(requestedIds)]

  if (uniqueIds.length === 0) {
    throw new FriendsListValidationError(
      'Choose at least one friend for this list.',
    )
  }

  if (uniqueIds.length > maximumFriendsListMemberCount) {
    throw new FriendsListValidationError(
      `A friends list can include up to ${maximumFriendsListMemberCount} friends.`,
    )
  }

  for (const memberId of uniqueIds) {
    if (!friendUserIdSet.has(memberId)) {
      throw new FriendsListValidationError(
        'Only people you already added as friends can be added to a list.',
      )
    }
  }

  return uniqueIds
}

/** Create a new friends list for the user. */
export async function createFriendsList(
  userId: string,
  name: string,
  friendUserIds: string[],
): Promise<FriendsList> {
  const payload = upsertFriendsListRequestSchema.parse({ name, friendUserIds })
  name = payload.name
  friendUserIds = payload.friendUserIds
  const friendUserIdSet = await getFriendUserIdSet(userId)
  const memberIds = resolveListMemberIds(friendUserIds, friendUserIdSet)

  const existing = await prisma.friendsList.findUnique({
    where: { userId_name: { userId, name } },
    select: { id: true },
  })

  if (existing) {
    throw new FriendsListValidationError(
      'You already have a list with that name.',
    )
  }

  const list = await prisma.friendsList.create({
    data: {
      userId,
      name,
      members: {
        create: memberIds.map((friendUserId) => ({ friendUserId })),
      },
    },
    include: friendsListInclude,
  })

  invalidateFriendsLists(userId)
  return serializeFriendsList(list, friendUserIdSet)
}

/** Replace a friends list's name and membership. */
export async function updateFriendsList(
  userId: string,
  listId: string,
  name: string,
  friendUserIds: string[],
  expectedUpdatedAt?: Date,
): Promise<FriendsList> {
  const payload = upsertFriendsListRequestSchema.parse({ name, friendUserIds })
  name = payload.name
  friendUserIds = payload.friendUserIds
  const friendUserIdSet = await getFriendUserIdSet(userId)
  const memberIds = resolveListMemberIds(friendUserIds, friendUserIdSet)

  const nameClash = await prisma.friendsList.findFirst({
    where: { userId, name, NOT: { id: listId } },
    select: { id: true },
  })

  if (nameClash) {
    throw new FriendsListValidationError(
      'You already have a list with that name.',
    )
  }

  const list = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "FriendsList" WHERE "id" = ${listId} AND "userId" = ${userId} FOR UPDATE`
    const owned = await transaction.friendsList.findFirst({
      where: { id: listId, userId },
      select: { id: true, updatedAt: true },
    })
    if (!owned) {
      throw new FriendsListValidationError(
        'That friends list no longer exists.',
      )
    }
    const nextUpdatedAt = nextRecordUpdatedAt(owned.updatedAt)
    if (expectedUpdatedAt) {
      const claimed = await transaction.friendsList.updateMany({
        where: { id: listId, userId, updatedAt: expectedUpdatedAt },
        data: { updatedAt: nextUpdatedAt },
      })
      if (claimed.count === 0) {
        throw new RecordChangedError(
          'That list changed or was deleted. Reopen Friends lists before changing it again.',
        )
      }
    }
    await transaction.friendsListMember.deleteMany({ where: { listId } })

    return transaction.friendsList.update({
      where: { id: listId },
      data: {
        name,
        updatedAt: nextUpdatedAt,
        members: {
          create: memberIds.map((friendUserId) => ({ friendUserId })),
        },
      },
      include: friendsListInclude,
    })
  })

  invalidateFriendsLists(userId)
  return serializeFriendsList(list, friendUserIdSet)
}

/** Delete a friends list. Returns whether a list was actually removed. */
export async function deleteFriendsList(
  userId: string,
  listId: string,
  expectedUpdatedAt?: Date,
): Promise<boolean> {
  const result = await prisma.friendsList.deleteMany({
    where: {
      id: listId,
      userId,
      ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
    },
  })

  if (result.count === 0 && expectedUpdatedAt) {
    throw new RecordChangedError(
      'That list changed or was deleted. Reopen Friends lists before deleting it.',
    )
  }
  if (result.count > 0) {
    invalidateFriendsLists(userId)
  }
  return result.count > 0
}

/**
 * Resolve a list to the owner's current friend members for use as a play-intent
 * audience. Throws when the list is missing or has no remaining members.
 */
export async function getFriendsListAudienceUserIds(
  userId: string,
  listId: string,
): Promise<string[]> {
  const [list, friendUserIdSet] = await Promise.all([
    prisma.friendsList.findFirst({
      where: { id: listId, userId },
      select: { members: { select: { friendUserId: true } } },
    }),
    getFriendUserIdSet(userId),
  ])

  if (!list) {
    throw new FriendsListValidationError('That friends list no longer exists.')
  }

  const memberIds = [
    ...new Set(list.members.map((member) => member.friendUserId)),
  ].filter((memberId) => friendUserIdSet.has(memberId))

  if (memberIds.length === 0) {
    throw new FriendsListValidationError(
      'That friends list has no friends left to notify.',
    )
  }

  return memberIds
}
