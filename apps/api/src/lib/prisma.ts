import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

declare global {
  var __gameIsUpPrisma__: PrismaClient | undefined
}

export const prisma =
  globalThis.__gameIsUpPrisma__ ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__gameIsUpPrisma__ = prisma
}
