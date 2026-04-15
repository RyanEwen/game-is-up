import { env } from './env.js'
import { prisma } from './prisma.js'

export async function getViewer(viewerId?: string | null) {
  if (viewerId) {
    const viewer = await prisma.user.findUnique({
      where: {
        id: viewerId
      }
    })

    if (viewer) {
      return viewer
    }
  }

  if (env.NODE_ENV === 'production') {
    return null
  }

  return prisma.user.findFirst({
    where: {
      handle: 'technicallyreal'
    }
  })
}