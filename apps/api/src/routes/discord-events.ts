/**
 * `/api/discord/events` — Discord Event Webhooks receiver.
 *
 * Discord delivers webhook events (and a verification PING) over HTTP POST and
 * signs every request with Ed25519. We MUST validate `X-Signature-Ed25519`
 * against our application's public key over `timestamp + rawBody`, returning
 * 401 on any failure — Discord routinely probes with deliberately-invalid
 * signatures and disables the feature if we ever accept one.
 *
 * https://discord.com/developers/docs/events/webhook-events
 *
 * Note: this router uses `express.raw()` and is intentionally mounted BEFORE
 * the global `express.json()` middleware in app.ts, because signature
 * verification needs the unparsed request body.
 */

import { createPublicKey, verify as verifyEd25519 } from 'node:crypto'
import { Router, raw } from 'express'
import type { KeyObject } from 'node:crypto'
import { env } from '../lib/env.js'
import { sendError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'

// Discord webhook payload `type` values.
const WEBHOOK_TYPE_PING = 0
const WEBHOOK_TYPE_EVENT = 1

// SPKI DER prefix for a raw 32-byte Ed25519 public key. Prepending this lets
// Node build a KeyObject from the bare hex key Discord shows in the portal.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

let cachedKey: { hex: string; key: KeyObject } | null = null

/** Build (and cache) a KeyObject from the configured hex public key. */
function getPublicKey(): KeyObject | null {
  const hex = env.DISCORD_PUBLIC_KEY
  if (!hex) {
    return null
  }

  if (cachedKey?.hex === hex) {
    return cachedKey.key
  }

  const raw = Buffer.from(hex, 'hex')
  if (raw.length !== 32) {
    return null
  }

  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw])
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' })
  cachedKey = { hex, key }
  return key
}

/** Verify the Ed25519 signature over `timestamp + rawBody`. */
function isValidSignature(
  rawBody: Buffer,
  signatureHex: string,
  timestamp: string,
): boolean {
  const publicKey = getPublicKey()
  if (!publicKey) {
    return false
  }

  let signature: Buffer
  try {
    signature = Buffer.from(signatureHex, 'hex')
  } catch {
    return false
  }

  if (signature.length !== 64) {
    return false
  }

  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody])

  try {
    return verifyEd25519(null, message, publicKey, signature)
  } catch {
    return false
  }
}

export const discordEventsRouter = Router()

discordEventsRouter.post('/', raw({ type: '*/*' }), (request, response) => {
  if (!env.DISCORD_PUBLIC_KEY) {
    logger.error(
      'Discord event webhook received but DISCORD_PUBLIC_KEY is not configured.',
    )
    sendError(response, 401, 'Invalid request signature.')
    return
  }

  const signature = request.header('X-Signature-Ed25519')
  const timestamp = request.header('X-Signature-Timestamp')
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)

  if (
    !signature ||
    !timestamp ||
    !isValidSignature(rawBody, signature, timestamp)
  ) {
    sendError(response, 401, 'Invalid request signature.')
    return
  }

  let payload: { type?: number; event?: { type?: string } }
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    sendError(response, 400, 'Invalid payload.')
    return
  }

  // PING — Discord's URL verification handshake. Acknowledge with 204.
  if (payload.type === WEBHOOK_TYPE_PING) {
    response.status(204).end()
    return
  }

  // Real webhook events. Acknowledge fast (within 3s) to avoid retries, then
  // handle out-of-band. There is nothing to dispatch yet, so just acknowledge.
  if (payload.type === WEBHOOK_TYPE_EVENT) {
    logger.info(
      `Discord webhook event received: ${payload.event?.type ?? 'unknown'}`,
    )
    response.status(204).end()
    return
  }

  response.status(204).end()
})
