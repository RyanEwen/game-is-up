/**
 * The one way the API reads and writes the Discord OAuth tokens on `UserIdentity`
 * (`discordAccessToken`, `discordRefreshToken`): they are stored encrypted with
 * `DISCORD_TOKEN_KEY` through `field-encryption.ts`, never as plaintext.
 *
 * Invariants:
 * - Writes go through `sealDiscordToken`; reads through `openDiscordToken`, which answers null
 *   (so the caller asks the player to sign in with Discord again) for a value it cannot decrypt.
 * - `encryptStoredDiscordTokens` runs once at startup, before the API listens: it encrypts any
 *   plaintext token left from before encryption and clears any token that no longer decrypts
 *   (for example after the key changed). It is idempotent, and each row is written only if its
 *   tokens are still the values it read, so a sign-in racing it is never overwritten.
 * - Token values are never logged; only counts are.
 */
import { AuthProvider } from '../generated/prisma/client.js'
import { env } from './env.js'
import {
  decryptField,
  encryptField,
  isEncryptedField,
  parseFieldEncryptionKey,
} from './field-encryption.js'
import { logger } from './logger.js'
import { prisma } from './prisma.js'

/** Rows read per batch by the startup pass. */
const startupBatchSize = 200

/** The decoded key; env validation has already checked its shape. */
const tokenKey = parseFieldEncryptionKey(env.DISCORD_TOKEN_KEY)

/** Encrypt a token for storage; null stays null. */
export function sealDiscordToken(token: string | null): string | null {
  return token === null ? null : encryptField(token, tokenKey)
}

/**
 * Decrypt a stored token.
 *
 * @returns The token, or null when none is stored or it cannot be decrypted (malformed,
 *   tampered, plaintext the startup pass has not converted, or written with another key).
 *   Callers treat null as "sign in with Discord again".
 */
export function openDiscordToken(stored: string | null): string | null {
  if (stored === null) {
    return null
  }

  try {
    return decryptField(stored, tokenKey)
  } catch {
    logger.warn('A stored Discord token could not be decrypted')
    return null
  }
}

/** What the startup pass does with one stored value. */
type StoredTokenAction =
  { kind: 'keep' } | { kind: 'encrypt'; value: string } | { kind: 'clear' }

/** Decide one stored value's fate: encrypt plaintext, keep what decrypts, clear the rest. */
function classifyStoredToken(stored: string | null): StoredTokenAction {
  if (stored === null) {
    return { kind: 'keep' }
  }

  if (!isEncryptedField(stored)) {
    return { kind: 'encrypt', value: encryptField(stored, tokenKey) }
  }

  try {
    decryptField(stored, tokenKey)
    return { kind: 'keep' }
  } catch {
    return { kind: 'clear' }
  }
}

/** Counts of tokens the startup pass changed; never any values. */
export type StoredDiscordTokenPassResult = {
  /** Plaintext tokens now stored encrypted. */
  encrypted: number
  /** Tokens that did not decrypt and were removed. */
  cleared: number
  /** Rows changed by a sign-in while the pass ran, left for the next start. */
  skipped: number
}

/**
 * Bring every stored Discord token into the encrypted format. Run once at startup, before
 * the API serves requests; safe to run again (a second run changes nothing).
 *
 * A token that fails to decrypt is cleared rather than failing startup: the player only has
 * to sign in with Discord again. Clearing the access token also clears its expiry.
 */
export async function encryptStoredDiscordTokens(): Promise<StoredDiscordTokenPassResult> {
  const result: StoredDiscordTokenPassResult = {
    encrypted: 0,
    cleared: 0,
    skipped: 0,
  }
  // Keyset paging by id: a row this pass clears drops out of the filter, so a Prisma cursor
  // pointing at it could skip the next row.
  let lastId: string | undefined

  for (;;) {
    // Page through identities that hold any token, in id order.
    const rows = await prisma.userIdentity.findMany({
      where: {
        provider: AuthProvider.DISCORD,
        ...(lastId ? { id: { gt: lastId } } : {}),
        OR: [
          { discordAccessToken: { not: null } },
          { discordRefreshToken: { not: null } },
        ],
      },
      select: {
        id: true,
        discordAccessToken: true,
        discordRefreshToken: true,
      },
      orderBy: { id: 'asc' },
      take: startupBatchSize,
    })

    for (const row of rows) {
      await convertIdentityTokens(row, result)
    }

    if (rows.length < startupBatchSize) {
      break
    }

    lastId = rows.at(-1)?.id
  }

  if (result.encrypted > 0 || result.cleared > 0 || result.skipped > 0) {
    logger.info('Converted stored Discord tokens', result)
  }

  return result
}

/**
 * Convert one identity's tokens and add to the counts. The update is conditional on both
 * tokens still holding the values read, so a concurrent sign-in wins.
 */
async function convertIdentityTokens(
  row: {
    id: string
    discordAccessToken: string | null
    discordRefreshToken: string | null
  },
  result: StoredDiscordTokenPassResult,
): Promise<void> {
  const access = classifyStoredToken(row.discordAccessToken)
  const refresh = classifyStoredToken(row.discordRefreshToken)

  if (access.kind === 'keep' && refresh.kind === 'keep') {
    return
  }

  const data: {
    discordAccessToken?: string | null
    discordAccessTokenExpiresAt?: null
    discordRefreshToken?: string | null
  } = {}

  if (access.kind === 'encrypt') {
    data.discordAccessToken = access.value
  } else if (access.kind === 'clear') {
    data.discordAccessToken = null
    data.discordAccessTokenExpiresAt = null
  }

  if (refresh.kind === 'encrypt') {
    data.discordRefreshToken = refresh.value
  } else if (refresh.kind === 'clear') {
    data.discordRefreshToken = null
  }

  const { count } = await prisma.userIdentity.updateMany({
    where: {
      id: row.id,
      discordAccessToken: row.discordAccessToken,
      discordRefreshToken: row.discordRefreshToken,
    },
    data,
  })

  if (count === 0) {
    result.skipped += 1
    return
  }

  for (const action of [access, refresh]) {
    if (action.kind === 'encrypt') {
      result.encrypted += 1
    } else if (action.kind === 'clear') {
      result.cleared += 1
    }
  }
}
