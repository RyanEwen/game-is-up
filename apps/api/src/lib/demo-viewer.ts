import { prisma } from './prisma.js'

export async function getViewer(viewerId?: string | null) {
  if (!viewerId) {
    return null
  }

  return prisma.user.findUnique({
    where: {
      id: viewerId
    }
  })
}