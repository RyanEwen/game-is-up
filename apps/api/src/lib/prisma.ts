/**
 * The API's one Prisma client (Prisma 7), connected through the pg driver adapter.
 *
 * Prisma 7 no longer manages connections itself: pg's pool does. Its limits are set here rather
 * than left to pg's defaults, which would wait forever for a free connection. Ten connections
 * (store-sign-controller's value) is ample for one API process, and a request that cannot get one
 * within ten seconds fails, as Prisma 6's `pool_timeout` did.
 *
 * Outside production the client is kept on `globalThis`, so a dev reload reuses its pool.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from './env.js'

declare global {
  var __gameIsUpPrisma__: PrismaClient | undefined
}

/** Most connections the pool opens. */
const poolMax = 10
/** How long a query waits for a free connection before failing, in milliseconds. */
const poolWaitMs = 10_000

export const prisma =
  globalThis.__gameIsUpPrisma__ ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: poolMax,
      connectionTimeoutMillis: poolWaitMs,
    }),
  })

if (env.NODE_ENV !== 'production') {
  globalThis.__gameIsUpPrisma__ = prisma
}
