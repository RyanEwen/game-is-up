/** Shared game-library reads and writes for web and private Discord panels.
 * Writes preserve notification backfill and dashboard refresh behavior across callers.
 */
import { GameIntentType, Prisma } from '@prisma/client'
import { upsertLibraryEntryRequestSchema, type CatalogGameMatch, type LibraryEntryIntent, type LibraryResponse, type UpsertLibraryEntryRequest } from '@game-is-up/shared'
import { findOrCreateGameByTitle, findOrCreateGameFromCatalogMatch } from './game-catalog.js'
import { nextRecordUpdatedAt, RecordChangedError } from './mutation-conflict.js'
import { prisma } from './prisma.js'
import { resolveAvailability } from './availability.js'
import { toClientGameCoverUrl } from './game-media.js'
import { getNetworkTrendingGames, getObservedLibrarySuggestions } from './library-suggestions.js'
import { backfillPlayIntentNotificationsForUserLibraryChange } from './play-intents.js'
import { publishDashboardInvalidation } from './dashboard-events.js'

function toLibraryEntryIntent(intentType: GameIntentType): LibraryEntryIntent {
  switch (intentType) {
    case GameIntentType.WISHLIST:
      return 'wishlist'
    case GameIntentType.PLAYING_NOW:
      return 'playing-now'
    default:
      return 'interested'
  }
}

/** Translate the shared library intent into the persisted enum. */
export function toPrismaIntentType(intent: LibraryEntryIntent): GameIntentType {
  switch (intent) {
    case 'wishlist':
      return GameIntentType.WISHLIST
    case 'playing-now':
      return GameIntentType.PLAYING_NOW
    default:
      return GameIntentType.INTERESTED
  }
}

/** Build the web library response with inherited availability and network suggestions. */
export async function buildLibraryResponse(userId: string): Promise<LibraryResponse> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      usualAvailability: true,
      gameInterests: {
        where: {
          intentType: {
            not: GameIntentType.COMPLETED
          }
        },
        include: {
          game: true,
          platforms: {
            orderBy: {
              platformLabel: 'asc'
            }
          }
        }
      }
    }
  })

  const entries = (user?.gameInterests ?? [])
    .map((entry) => ({
      id: entry.id,
      gameId: entry.gameId,
      title: entry.game.title,
      coverUrl: toClientGameCoverUrl(entry.game.coverUrl),
      platformLabels: entry.platforms.map((platform) => platform.platformLabel),
      intent: toLibraryEntryIntent(entry.intentType),
      ...resolveAvailability(entry.availability, user?.usualAvailability ?? null)
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
  const entryGameIds = entries.map((entry) => entry.gameId)
  const [suggestedGames, trendingGames] = await Promise.all([
    getObservedLibrarySuggestions(userId, entryGameIds),
    getNetworkTrendingGames(userId, entryGameIds)
  ])

  return {
    usualAvailability: user?.usualAvailability ?? null,
    entries,
    suggestedGames,
    trendingGames
  }
}

async function resolveGame(catalogMatch: CatalogGameMatch | undefined, title: string) {
  if (catalogMatch) {
    return findOrCreateGameFromCatalogMatch(catalogMatch)
  }

  return findOrCreateGameByTitle(title)
}

/** Validate the shared contract and save a catalog or title-based library entry. */
export async function upsertLibraryEntry(userId: string, input: unknown) {
  const payload = upsertLibraryEntryRequestSchema.parse(input)
  const game = await resolveGame(payload.catalogMatch, payload.title)
  await saveLibraryGame(userId, game.id, payload)
}

export type LibrarySaveCondition =
  | { kind: 'create' }
  | { kind: 'edit'; entryId: string; updatedAt: Date; preservePlatforms?: boolean }

/**
 * Save a catalog game with shared validation and side effects. HTTP callers retain upsert
 * semantics; private add/edit forms use create-only or compare-and-set to reject stale writes.
 */
export async function saveLibraryGame(
  userId: string,
  gameId: string,
  input: UpsertLibraryEntryRequest,
  condition?: LibrarySaveCondition
) {
  await writeLibraryGame(userId, gameId, input, condition)
  await backfillPlayIntentNotificationsForUserLibraryChange(userId)
  publishDashboardInvalidation({ domains: ['library', 'discovery', 'play-intents'] })
}

/** Transaction-only write for imports that backfill and invalidate once after their entire batch. */
export async function writeLibraryGame(userId: string, gameId: string, input: UpsertLibraryEntryRequest, condition?: LibrarySaveCondition) {
  const payload = upsertLibraryEntryRequestSchema.parse(input)
  const fields = {
    intentType: toPrismaIntentType(payload.intent),
    availability: payload.availability?.trim() || null
  }
  const platformLabels = [...new Set(payload.platformLabels.map((label) => label.trim()).filter(Boolean))]

  try {
    await prisma.$transaction(async (transaction) => {
      await lockLibraryGame(transaction, userId, gameId)
      const interestId = await saveInterestRecord(transaction, userId, gameId, fields, condition)

      // A blank private platform field preserves rows in place, after the revision claim.
      if (condition?.kind === 'edit' && condition.preservePlatforms) {
        return
      }
      await transaction.userGameInterestPlatform.deleteMany({ where: { userGameInterestId: interestId } })
      await transaction.userGameInterestPlatform.createMany({
        data: platformLabels.map((platformLabel) => ({ userGameInterestId: interestId, platformLabel }))
      })
    })
  } catch (error) {
    if (condition?.kind === 'create' && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RecordChangedError('That game is already in your library. Open My games to edit its current settings.')
    }
    throw error
  }
}

/** Claim the exact owned version before changing platforms; updates never recreate a removed entry. */
async function saveInterestRecord(
  transaction: Prisma.TransactionClient,
  userId: string,
  gameId: string,
  fields: { intentType: GameIntentType; availability: string | null },
  condition?: LibrarySaveCondition
) {
  const current = await transaction.userGameInterest.findUnique({
    where: { userId_gameId: { userId, gameId } }, select: { id: true, updatedAt: true }
  })
  const updatedAt = current ? nextRecordUpdatedAt(current.updatedAt) : new Date()
  if (condition?.kind === 'edit') {
    const result = await transaction.userGameInterest.updateMany({
      where: { id: condition.entryId, userId, gameId, updatedAt: condition.updatedAt },
      data: { ...fields, updatedAt }
    })
    if (result.count === 0) {
      throw new RecordChangedError('That game changed or was removed. Open My games and review its current settings before editing again.')
    }
    return condition.entryId
  }
  if (condition?.kind === 'create') {
    if (current) {
      throw new RecordChangedError('That game is already in your library. Open My games to edit its current settings.')
    }
    const interest = await transaction.userGameInterest.create({ data: { userId, gameId, ...fields } })
    return interest.id
  }
  const interest = await transaction.userGameInterest.upsert({
    where: { userId_gameId: { userId, gameId } },
    update: { ...fields, updatedAt },
    create: { userId, gameId, ...fields }
  })
  return interest.id
}

/** Serialize all shared writers, including creation and Steam import, without changing web upsert semantics. */
async function lockLibraryGame(transaction: Prisma.TransactionClient, userId: string, gameId: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library:${userId}:${gameId}`}))`
}

/** Remove only the caller's entry; a missing or foreign entry returns false. */
export async function removeLibraryEntry(userId: string, entryId: string, expectedUpdatedAt?: Date): Promise<boolean> {
  const deleted = await prisma.$transaction(async (transaction) => {
    const owned = await transaction.userGameInterest.findFirst({ where: { id: entryId, userId }, select: { gameId: true } })
    if (!owned) {
      return { count: 0 }
    }
    await lockLibraryGame(transaction, userId, owned.gameId)
    return transaction.userGameInterest.deleteMany({
      where: { id: entryId, userId, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) }
    })
  })
  if (deleted.count === 0) {
    if (expectedUpdatedAt) {
      throw new RecordChangedError('That game changed or was removed. Open My games before removing it again.')
    }
    return false
  }
  publishDashboardInvalidation({ domains: ['library', 'discovery', 'play-intents'] })
  return true
}

/** Read editable raw availability rather than the inherited display fallback. */
export async function getLibraryEntries(userId: string) {
  return prisma.userGameInterest.findMany({
    where: { userId, intentType: { not: GameIntentType.COMPLETED } },
    include: { game: true, platforms: { orderBy: { platformLabel: 'asc' } } },
    orderBy: [{ game: { title: 'asc' } }, { id: 'asc' }]
  })
}
