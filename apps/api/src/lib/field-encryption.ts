/**
 * Encrypts single database values at rest with AES-256-GCM (node:crypto).
 *
 * A stored value is one ASCII string, `v1:<iv>:<tag>:<ciphertext>`, each part standard base64:
 * a fresh random 12-byte IV per value, GCM's 16-byte authentication tag, then the ciphertext.
 * The `v1` prefix names the format and key generation, so a later key rotation can add `v2`
 * and re-encrypt old values without guessing which key wrote them.
 *
 * This module is domain-neutral: it never reads the environment or the database. Callers pass
 * the 32-byte key (see `parseFieldEncryptionKey`) and decide what a failed decryption means.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'
const currentVersion = 'v1'
/** AES-256 needs exactly 32 bytes of key. */
const keyLength = 32
/** GCM's recommended nonce length. */
const ivLength = 12
/** GCM's full-length authentication tag. */
const tagLength = 16
/** Canonical, padded standard base64 (no whitespace, no URL-safe alphabet). */
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** A stored value could not be decrypted: malformed, tampered with, or written with another key. */
export class FieldDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldDecryptionError'
  }
}

/**
 * Decode standard base64 strictly. `Buffer.from(value, 'base64')` silently skips invalid
 * characters, so the text is checked first and must re-encode to itself.
 *
 * @returns The bytes, or null when `value` is not canonical padded base64.
 */
function decodeBase64Strict(value: string): Buffer | null {
  if (!base64Pattern.test(value)) {
    return null
  }

  const bytes = Buffer.from(value, 'base64')

  return bytes.toString('base64') === value ? bytes : null
}

/**
 * Turn a base64 key from the environment into the 32-byte AES-256 key.
 *
 * @param base64Key 32 random bytes in standard base64, as `openssl rand -base64 32` prints.
 * @throws Error when the text is not canonical base64 or does not decode to exactly 32 bytes.
 *   The message never includes the key.
 */
export function parseFieldEncryptionKey(base64Key: string): Buffer {
  const key = decodeBase64Strict(base64Key.trim())

  if (!key || key.length !== keyLength) {
    throw new Error(
      `An encryption key must be ${keyLength} bytes in standard base64 (openssl rand -base64 32).`,
    )
  }

  return key
}

/**
 * Whether a stored value is in the versioned encrypted format (by its prefix only).
 * A value that is not is plaintext from before encryption, or something else entirely; a
 * value that is may still fail to decrypt.
 */
export function isEncryptedField(value: string): boolean {
  return value.startsWith(`${currentVersion}:`)
}

/**
 * Encrypt one value with a fresh random IV.
 *
 * @param plaintext The value to protect (UTF-8).
 * @param key The 32-byte key from `parseFieldEncryptionKey`.
 * @returns `v1:<iv>:<tag>:<ciphertext>`; encrypting the same text twice gives different strings.
 */
export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, key, iv, {
    authTagLength: tagLength,
  })
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    currentVersion,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decrypt a value written by `encryptField`.
 *
 * @param stored The stored `v1:<iv>:<tag>:<ciphertext>` string.
 * @param key The 32-byte key from `parseFieldEncryptionKey`.
 * @returns The original plaintext.
 * @throws FieldDecryptionError when the value is malformed, has an unknown version, was
 *   tampered with, or was encrypted with a different key. The message never includes the value.
 */
export function decryptField(stored: string, key: Buffer): string {
  const [version, ivText, tagText, ciphertextText, ...extra] = stored.split(':')

  if (
    version !== currentVersion ||
    ivText === undefined ||
    tagText === undefined ||
    ciphertextText === undefined ||
    extra.length > 0
  ) {
    throw new FieldDecryptionError('Not a v1 encrypted value.')
  }

  const iv = decodeBase64Strict(ivText)
  const tag = decodeBase64Strict(tagText)
  const ciphertext = decodeBase64Strict(ciphertextText)

  if (
    !iv ||
    iv.length !== ivLength ||
    !tag ||
    tag.length !== tagLength ||
    !ciphertext
  ) {
    throw new FieldDecryptionError('Malformed encrypted value.')
  }

  // GCM checks the tag in final(): a wrong key or any changed byte fails there.
  try {
    const decipher = createDecipheriv(algorithm, key, iv, {
      authTagLength: tagLength,
    })
    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new FieldDecryptionError(
      'Encrypted value failed authentication (tampered or another key).',
    )
  }
}
