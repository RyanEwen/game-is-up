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

  return prisma.user.findFirst({
    where: {
      handle: 'partyfinder'
    }
  })
}