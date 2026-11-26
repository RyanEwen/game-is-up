/**
 * Unit tests for at-rest value encryption: the round trip, a fresh IV per value, tamper and
 * wrong-key detection, malformed stored values, and strict key parsing.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import {
  decryptField,
  encryptField,
  FieldDecryptionError,
  isEncryptedField,
  parseFieldEncryptionKey,
} from './field-encryption.js'

const key = randomBytes(32)

/** One `:`-separated part of a stored value (empty when absent). */
function part(stored: string, index: number): string {
  return stored.split(':')[index] ?? ''
}

/** Replace one base64 part of a stored value, keeping the rest. */
function withPart(stored: string, index: number, value: string): string {
  const parts = stored.split(':')
  parts[index] = value

  return parts.join(':')
}

/** Flip the first byte of a base64 part, keeping it valid base64 of the same length. */
function flipFirstByte(base64: string): string {
  const bytes = Buffer.from(base64, 'base64')
  bytes.writeUInt8(bytes.readUInt8(0) ^ 0x01, 0)

  return bytes.toString('base64')
}

test('a value round-trips, including non-ASCII and empty text', () => {
  for (const plaintext of [
    'discord-token-abc.123',
    `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x1f3ae)}`,
    '',
  ]) {
    const stored = encryptField(plaintext, key)

    assert.ok(isEncryptedField(stored))
    assert.match(stored, /^v1:[^:]+:[^:]+:[^:]*$/)
    assert.equal(decryptField(stored, key), plaintext)
  }
})

test('each encryption uses a fresh IV, so equal values store differently', () => {
  const first = encryptField('same-token', key)
  const second = encryptField('same-token', key)

  assert.notEqual(first, second)
  assert.notEqual(part(first, 1), part(second, 1))
  assert.equal(Buffer.from(part(first, 1), 'base64').length, 12)
})

test('a changed ciphertext, tag or IV is detected', () => {
  const stored = encryptField('discord-refresh-token', key)

  for (const index of [1, 2, 3]) {
    const tampered = withPart(stored, index, flipFirstByte(part(stored, index)))

    assert.throws(() => decryptField(tampered, key), FieldDecryptionError)
  }
})

test('a value written with another key does not decrypt', () => {
  const stored = encryptField('discord-refresh-token', key)

  assert.throws(
    () => decryptField(stored, randomBytes(32)),
    FieldDecryptionError,
  )
})

test('malformed stored values throw FieldDecryptionError, never another error', () => {
  const stored = encryptField('token', key)
  const malformed = [
    'plain-legacy-token',
    '',
    'v1:',
    'v1:a:b',
    `v2${stored.slice(2)}`,
    `${stored}:extra`,
    withPart(stored, 1, 'not base64!'),
    withPart(stored, 1, Buffer.alloc(8).toString('base64')),
    withPart(stored, 2, Buffer.alloc(8).toString('base64')),
    withPart(stored, 3, 'abc'),
  ]

  for (const value of malformed) {
    assert.throws(() => decryptField(value, key), FieldDecryptionError, value)
  }
})

test('only the versioned prefix counts as encrypted', () => {
  assert.equal(isEncryptedField('v1:x:y:z'), true)
  assert.equal(isEncryptedField('mfa.plaintext-token'), false)
  assert.equal(isEncryptedField('v2:x:y:z'), false)
})

test('a key must be canonical base64 of exactly 32 bytes', () => {
  const base64Key = randomBytes(32).toString('base64')

  assert.equal(parseFieldEncryptionKey(base64Key).length, 32)
  assert.equal(parseFieldEncryptionKey(`${base64Key}\n`).length, 32)

  for (const invalid of [
    '',
    randomBytes(16).toString('base64'),
    randomBytes(33).toString('base64'),
    randomBytes(32).toString('hex'),
    base64Key.replace(/=$/, ''),
    `${base64Key.slice(0, 20)}!${base64Key.slice(21)}`,
  ]) {
    assert.throws(() => parseFieldEncryptionKey(invalid), /32 bytes/)
  }
})

test('error messages never include the value or the key', () => {
  const stored = encryptField('secret-token-value', key)

  try {
    decryptField(stored, randomBytes(32))
    assert.fail('expected a decryption failure')
  } catch (error) {
    assert.ok(error instanceof FieldDecryptionError)
    assert.ok(!error.message.includes(part(stored, 3)))
  }

  const badKey = 'not-a-real-key-value'
  assert.throws(
    () => parseFieldEncryptionKey(badKey),
    (error: Error) => !error.message.includes(badKey),
  )
})
