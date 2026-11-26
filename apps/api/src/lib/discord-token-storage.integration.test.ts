/**
 * Real PostgreSQL checks for the startup pass that encrypts stored Discord tokens: plaintext is
 * encrypted, tokens that do not decrypt are cleared, a second run changes nothing, and the
 * read path opens what the write path seals.
 * Run by `npm run test:integration` against a disposable `*_test` database; they fail, never skip, without one.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import { prisma } from './prisma.js'
import { assertDisposableDatabase } from '../test-utils/disposable-database.js'
import { encryptField, isEncryptedField } from './field-encryption.js'
import {
  encryptStoredDiscordTokens,
  openDiscordToken,
  sealDiscordToken,
} from './discord-token-storage.js'

/** Create a user with a Discord identity holding the given stored token values. */
async function createIdentity(
  prefix: string,
  name: string,
  tokens: { access: string | null; refresh: string | null },
) {
  const user = await prisma.user.create({
    data: {
      handle: `${prefix}-${name}`,
      displayName: name,
      identities: {
        create: {
          provider: 'DISCORD',
          providerUserId: `${prefix}-${name}`,
          discordAccessToken: tokens.access,
          discordRefreshToken: tokens.refresh,
          discordAccessTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    },
  })

  return user.id
}

/** Read back one user's stored Discord token columns. */
function readIdentity(userId: string) {
  return prisma.userIdentity.findFirstOrThrow({
    where: { userId, provider: 'DISCORD' },
    select: {
      discordAccessToken: true,
      discordRefreshToken: true,
      discordAccessTokenExpiresAt: true,
    },
  })
}

test('the startup pass encrypts plaintext tokens, clears undecryptable ones, and is idempotent', async () => {
  assertDisposableDatabase()
  const prefix = randomUUID().slice(0, 8)
  const otherKey = randomBytes(32)

  const legacyId = await createIdentity(prefix, 'legacy', {
    access: `legacy-access-${prefix}`,
    refresh: `legacy-refresh-${prefix}`,
  })
  const foreignId = await createIdentity(prefix, 'foreign', {
    access: encryptField(`foreign-access-${prefix}`, otherKey),
    refresh: encryptField(`foreign-refresh-${prefix}`, otherKey),
  })
  const sealedRefresh = sealDiscordToken(`current-refresh-${prefix}`)
  const currentId = await createIdentity(prefix, 'current', {
    access: null,
    refresh: sealedRefresh,
  })

  try {
    const first = await encryptStoredDiscordTokens()
    assert.ok(first.encrypted >= 2, 'both plaintext tokens are encrypted')
    assert.ok(first.cleared >= 2, 'both foreign-key tokens are cleared')

    // Plaintext rows now hold ciphertext that opens to the original tokens.
    const legacy = await readIdentity(legacyId)
    assert.ok(isEncryptedField(legacy.discordAccessToken!))
    assert.ok(isEncryptedField(legacy.discordRefreshToken!))
    assert.equal(
      openDiscordToken(legacy.discordAccessToken),
      `legacy-access-${prefix}`,
    )
    assert.equal(
      openDiscordToken(legacy.discordRefreshToken),
      `legacy-refresh-${prefix}`,
    )
    assert.notEqual(legacy.discordAccessTokenExpiresAt, null)

    // Tokens from another key are gone, with the access token's expiry.
    assert.deepEqual(await readIdentity(foreignId), {
      discordAccessToken: null,
      discordRefreshToken: null,
      discordAccessTokenExpiresAt: null,
    })

    // Already-encrypted tokens are left byte for byte.
    const current = await readIdentity(currentId)
    assert.equal(current.discordRefreshToken, sealedRefresh)
    assert.equal(
      openDiscordToken(current.discordRefreshToken),
      `current-refresh-${prefix}`,
    )

    // A second run finds nothing to do and leaves the ciphertext as it was.
    const second = await encryptStoredDiscordTokens()
    assert.equal(second.encrypted, 0)
    assert.equal(second.cleared, 0)
    assert.deepEqual(await readIdentity(legacyId), legacy)
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [legacyId, foreignId, currentId] } },
    })
  }
})

test('reading a stored token answers null for nothing stored or anything that does not decrypt', () => {
  assert.equal(openDiscordToken(null), null)
  assert.equal(openDiscordToken('plaintext-never-converted'), null)
  assert.equal(openDiscordToken(encryptField('token', randomBytes(32))), null)
  assert.equal(sealDiscordToken(null), null)
})
