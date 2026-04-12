import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import type { AuthProvider } from '@game-is-up/shared'
import { parseCookies, serializeCookie } from './cookies.js'
import { env } from './env.js'

const SESSION_COOKIE_NAME = 'giu_session'
const DISCORD_STATE_COOKIE_NAME = 'giu_discord_state'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const DISCORD_STATE_TTL_SECONDS = 60 * 10
const MOBILE_AUTH_HANDOFF_TTL_SECONDS = 60
const STEAM_LINK_STATE_TTL_SECONDS = 60 * 10

type SessionPayload = {
  userId: string;
  authProvider: AuthProvider;
  issuedAt: string;
};

type DiscordStatePayload = {
  state: string;
  issuedAt: string;
  redirectTo: string;
};

type MobileAuthHandoffPayload = {
  userId: string;
  authProvider: AuthProvider;
  issuedAt: string;
};

type SteamLinkStatePayload = {
  userId: string;
  redirectTo: string;
  issuedAt: string;
};

function signValue(encodedPayload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(encodedPayload).digest('base64url')
}

function encodeSignedPayload(payload: SessionPayload | DiscordStatePayload | MobileAuthHandoffPayload | SteamLinkStatePayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = signValue(encodedPayload)
  return `${encodedPayload}.${signature}`
}

function decodeSignedPayload<T>(value: string | undefined): T | null {
  if (!value) {
    return null
  }

  const [encodedPayload, signature] = value.split('.')
  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signValue(encodedPayload)
  if (expectedSignature.length !== signature.length) {
    return null
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

function isFreshPayload(issuedAtValue: string, ttlSeconds: number): boolean {
  const issuedAt = Date.parse(issuedAtValue)

  if (Number.isNaN(issuedAt)) {
    return false
  }

  return Date.now() <= issuedAt + ttlSeconds * 1000
}

function defaultCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge
  }
}

export function getAuthSession(request: Request): SessionPayload | null {
  const cookies = parseCookies(request.headers.cookie)
  return decodeSignedPayload<SessionPayload>(cookies[SESSION_COOKIE_NAME])
}

export function setAuthSession(response: Response, userId: string, authProvider: AuthProvider): void {
  const payload: SessionPayload = {
    userId,
    authProvider,
    issuedAt: new Date().toISOString()
  }

  response.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, encodeSignedPayload(payload), defaultCookieOptions(SESSION_TTL_SECONDS)))
}

export function clearAuthSession(response: Response): void {
  response.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, '', defaultCookieOptions(0)))
}

export function createMobileAuthHandoff(userId: string, authProvider: AuthProvider): string {
  const payload: MobileAuthHandoffPayload = {
    userId,
    authProvider,
    issuedAt: new Date().toISOString()
  }

  return encodeSignedPayload(payload)
}

export function consumeMobileAuthHandoff(value: string | undefined): MobileAuthHandoffPayload | null {
  const payload = decodeSignedPayload<MobileAuthHandoffPayload>(value)

  if (!payload || !isFreshPayload(payload.issuedAt, MOBILE_AUTH_HANDOFF_TTL_SECONDS)) {
    return null
  }

  return payload
}

export function createSteamLinkState(userId: string, redirectTo: string): string {
  const payload: SteamLinkStatePayload = {
    userId,
    redirectTo,
    issuedAt: new Date().toISOString()
  }

  return encodeSignedPayload(payload)
}

export function consumeSteamLinkState(value: string | undefined): SteamLinkStatePayload | null {
  const payload = decodeSignedPayload<SteamLinkStatePayload>(value)

  if (!payload || !isFreshPayload(payload.issuedAt, STEAM_LINK_STATE_TTL_SECONDS)) {
    return null
  }

  return payload
}

export function createDiscordState(): string {
  return randomBytes(24).toString('hex')
}

export function setDiscordState(response: Response, state: string, redirectTo: string): void {
  const payload: DiscordStatePayload = {
    state,
    issuedAt: new Date().toISOString(),
    redirectTo
  }

  response.append('Set-Cookie', serializeCookie(DISCORD_STATE_COOKIE_NAME, encodeSignedPayload(payload), defaultCookieOptions(DISCORD_STATE_TTL_SECONDS)))
}

export function clearDiscordState(response: Response): void {
  response.append('Set-Cookie', serializeCookie(DISCORD_STATE_COOKIE_NAME, '', defaultCookieOptions(0)))
}

export function consumeDiscordState(request: Request, state: string): DiscordStatePayload | null {
  const cookies = parseCookies(request.headers.cookie)
  const payload = decodeSignedPayload<DiscordStatePayload>(cookies[DISCORD_STATE_COOKIE_NAME])

  if (!payload || payload.state !== state) {
    return null
  }

  return payload
}