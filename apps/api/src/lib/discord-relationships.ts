import type {
  DiscordAccountInstallStatus,
  DiscordFriendsResponse,
  DiscordRelationshipType as SharedDiscordRelationshipType
} from '@game-is-up/shared'
import { AuthProvider as PrismaAuthProvider, DiscordRelationshipType as PrismaDiscordRelationshipType } from '@prisma/client'
import { isDiscordEventWebhookConfigured } from './discord-account-installs.js'
import { prisma } from './prisma.js'

type ImportedDiscordFriend = {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  relationshipType: SharedDiscordRelationshipType;
};

const relationshipTypeToPrisma: Record<SharedDiscordRelationshipType, PrismaDiscordRelationshipType> = {
  friend: PrismaDiscordRelationshipType.FRIEND,
  blocked: PrismaDiscordRelationshipType.BLOCKED,
  'pending-incoming': PrismaDiscordRelationshipType.PENDING_INCOMING,
  'pending-outgoing': PrismaDiscordRelationshipType.PENDING_OUTGOING
}

const relationshipTypeFromPrisma: Record<PrismaDiscordRelationshipType, SharedDiscordRelationshipType> = {
  FRIEND: 'friend',
  BLOCKED: 'blocked',
  PENDING_INCOMING: 'pending-incoming',
  PENDING_OUTGOING: 'pending-outgoing'
}

export async function replaceDiscordRelationshipsForUser(userId: string, importedFriends: ImportedDiscordFriend[]) {
  const dedupedFriends = [...new Map(importedFriends.map((friend) => [friend.discordUserId, friend])).values()]
  const discordUserIds = dedupedFriends.map((friend) => friend.discordUserId)
  const syncedAt = new Date()

  await prisma.$transaction(async (transaction) => {
    await transaction.discordRelationship.deleteMany({
      where: {
        ownerUserId: userId,
        ...(discordUserIds.length > 0
          ? {
              discordUserId: {
                notIn: discordUserIds
              }
            }
          : {})
      }
    })

    for (const friend of dedupedFriends) {
      await transaction.discordRelationship.upsert({
        where: {
          ownerUserId_discordUserId: {
            ownerUserId: userId,
            discordUserId: friend.discordUserId
          }
        },
        update: {
          username: friend.username,
          displayName: friend.displayName,
          avatarUrl: friend.avatarUrl,
          relationshipType: relationshipTypeToPrisma[friend.relationshipType]
        },
        create: {
          ownerUserId: userId,
          discordUserId: friend.discordUserId,
          username: friend.username,
          displayName: friend.displayName,
          avatarUrl: friend.avatarUrl,
          relationshipType: relationshipTypeToPrisma[friend.relationshipType]
        }
      })
    }

    await transaction.userIdentity.updateMany({
      where: {
        userId,
        provider: PrismaAuthProvider.DISCORD
      },
      data: {
        lastDiscordRelationshipsSyncAt: syncedAt,
        discordRelationshipSyncStatus: 'SYNCED',
        discordRelationshipSyncError: null
      }
    })
  })

  return syncedAt
}

export async function listDiscordFriendsForUser(userId: string): Promise<DiscordFriendsResponse> {
  const installTrackingConfigured = isDiscordEventWebhookConfigured()
  const relationships = await prisma.discordRelationship.findMany({
    where: {
      ownerUserId: userId,
      relationshipType: PrismaDiscordRelationshipType.FRIEND
    },
    orderBy: [
      {
        displayName: 'asc'
      },
      {
        username: 'asc'
      }
    ]
  })

  if (relationships.length === 0) {
    return {
      counts: {
        total: 0,
        installed: 0,
        appUsers: 0,
        addableAppUsers: 0
      },
      friends: [],
      note: 'No Discord friends have been imported yet.'
    }
  }

  const discordUserIds = relationships.map((relationship) => relationship.discordUserId)
  const [installs, identities] = await Promise.all([
    prisma.discordAccountInstall.findMany({
      where: {
        discordUserId: {
          in: discordUserIds
        }
      }
    }),
    prisma.userIdentity.findMany({
      where: {
        provider: PrismaAuthProvider.DISCORD,
        providerUserId: {
          in: discordUserIds
        }
      },
      select: {
        providerUserId: true,
        userId: true
      }
    })
  ])

  const appUserIds = identities.map((identity) => identity.userId)
  const [appUsers, existingFriends] = await Promise.all([
    appUserIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: {
              in: appUserIds
            }
          },
          select: {
            id: true,
            handle: true,
            displayName: true,
            avatarUrl: true
          }
        })
      : Promise.resolve([]),
    appUserIds.length > 0
      ? prisma.friend.findMany({
          where: {
            userId,
            friendedUserId: {
              in: appUserIds
            }
          },
          select: {
            friendedUserId: true
          }
        })
      : Promise.resolve([])
  ])

  const installsByDiscordUserId = new Map(installs.map((install) => [install.discordUserId, install]))
  const appUserIdByDiscordUserId = new Map(identities.map((identity) => [identity.providerUserId, identity.userId]))
  const appUsersById = new Map(appUsers.map((appUser) => [appUser.id, appUser]))
  const existingFriendIds = new Set(existingFriends.map((friend) => friend.friendedUserId))

  const friends = relationships.map((relationship) => {
    const install = installsByDiscordUserId.get(relationship.discordUserId)
    const appUserId = appUserIdByDiscordUserId.get(relationship.discordUserId) ?? null
    const appUser = appUserId ? appUsersById.get(appUserId) ?? null : null
    const alreadyFriend = appUser ? existingFriendIds.has(appUser.id) : false
    const installStatus: DiscordAccountInstallStatus = install?.installed
      ? 'installed'
      : install
        ? 'removed'
        : installTrackingConfigured
          ? 'missing'
          : 'unknown'

    return {
      discordUserId: relationship.discordUserId,
      username: relationship.username,
      displayName: relationship.displayName,
      avatarUrl: relationship.avatarUrl,
      relationshipType: relationshipTypeFromPrisma[relationship.relationshipType],
      installStatus,
      appUser,
      alreadyFriend
    }
  })

  return {
    counts: {
      total: friends.length,
      installed: friends.filter((friend) => friend.installStatus === 'installed').length,
      appUsers: friends.filter((friend) => friend.appUser != null).length,
      addableAppUsers: friends.filter((friend) => friend.appUser != null && !friend.alreadyFriend).length
    },
    friends,
    note: null
  }
}