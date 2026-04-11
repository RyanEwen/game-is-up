import { prisma } from './prisma.js'
import { env } from './env.js'

const sampleFriendHandles = ['raidandrelax', 'nightqueue'] as const
const seededHandles = new Set(['partyfinder', ...sampleFriendHandles])

export async function ensureDevelopmentSampleFriends(user: { id: string; handle: string }) {
  if (env.NODE_ENV === 'production' || seededHandles.has(user.handle)) {
    return
  }

  const existingFriendCount = await prisma.friend.count({
    where: {
      userId: user.id
    }
  })

  if (existingFriendCount > 0) {
    return
  }

  const sampleFriends = await prisma.user.findMany({
    where: {
      handle: {
        in: [...sampleFriendHandles]
      }
    },
    select: {
      id: true
    }
  })

  if (sampleFriends.length === 0) {
    return
  }

  await prisma.friend.createMany({
    data: sampleFriends.map((sampleFriend) => ({
      userId: user.id,
      friendedUserId: sampleFriend.id
    })),
    skipDuplicates: true
  })
}