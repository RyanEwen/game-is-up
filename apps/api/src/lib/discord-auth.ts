/**
 * Discord OAuth provider implementation.
 *
 * Handles the authorize URL, code exchange, profile + guild fetches, and
 * upsert of the corresponding `User` and `UserDiscordIdentity` rows. Stores
 * the OAuth refresh token so a signed-in user can later refresh their guild
 * membership list from the Network page without redoing the full OAuth
 * round-trip unless Discord has revoked the grant.
 */

import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import { prisma } from './prisma.js'
import { env } from './env.js'
import { ensureUniqueHandle, normalizeHandleBase } from './user-profile.js'

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'
const DISCORD_ME_URL = 'https://discord.com/api/users/@me'
const DISCORD_GUILDS_URL = 'https://discord.com/api/users/@me/guilds'
const DISCORD_BOT_SCOPES = ['bot', 'applications.commands'] as const
const DISCORD_BOT_PERMISSIONS = '0'
const developmentSeededDiscordHandleAliases = new Map([
  ['technicallyreal', 'technicallyreal']
])

export const DISCORD_REQUESTED_SCOPES = ['identify', 'email', 'guilds'] as const

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type DiscordUserProfile = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email?: string | null;
};

export type DiscordGuildSummary = {
  id: string;
  name: string;
  icon: string | null;
};

export type UpsertDiscordUserResult = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    bio: string;
    timezoneId: string;
    usualAvailability: string | null;
    discordAutoPromptPlayIntent: boolean;
    isAdmin: boolean;
    visibility: import('@prisma/client').ProfileVisibility;
    lastSeenAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  isNewDiscordIdentity: boolean;
};

export class DiscordOauthRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DiscordOauthRequestError'
    this.status = status
  }
}

function normalizeGrantedScopes(scope: string): string[] {
  return [...new Set(scope.split(/\s+/u).map((entry) => entry.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function buildDiscordAvatarUrl(profile: DiscordUserProfile): string | null {
  if (!profile.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256`
}

function getDevelopmentSeededHandleAlias(profile: DiscordUserProfile): string | null {
  if (env.NODE_ENV === 'production') {
    return null
  }

  const candidates = [profile.username, profile.global_name]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeHandleBase(value))

  for (const candidate of candidates) {
    const alias = developmentSeededDiscordHandleAliases.get(candidate)

    if (alias) {
      return alias
    }
  }

  return null
}

export function isDiscordAuthConfigured(): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_CALLBACK_URL)
}

export function buildDiscordAuthorizationUrl(state: string): string {
  const url = new URL(DISCORD_AUTHORIZE_URL)
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID ?? '')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', env.DISCORD_CALLBACK_URL ?? '')
  url.searchParams.set('scope', DISCORD_REQUESTED_SCOPES.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export function buildDiscordBotInstallUrl(): string | null {
  if (!env.DISCORD_CLIENT_ID) {
    return null
  }

  const url = new URL(DISCORD_AUTHORIZE_URL)
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  url.searchParams.set('scope', DISCORD_BOT_SCOPES.join(' '))
  url.searchParams.set('permissions', DISCORD_BOT_PERMISSIONS)

  return url.toString()
}

async function parseDiscordError(response: Response, action: string): Promise<never> {
  const responseText = await response.text()
  const normalizedText = responseText.trim()
  const detail = normalizedText ? ` - ${normalizedText}` : ''

  throw new DiscordOauthRequestError(
    `Discord ${action} failed: ${response.status} ${response.statusText}${detail}`,
    response.status
  )
}

async function requestDiscordToken(body: URLSearchParams): Promise<DiscordTokenResponse> {
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    await parseDiscordError(response, 'token exchange')
  }

  return response.json() as Promise<DiscordTokenResponse>
}

export async function exchangeDiscordCode(code: string, options?: { redirectUri?: string | null }): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID ?? '',
    client_secret: env.DISCORD_CLIENT_SECRET ?? '',
    grant_type: 'authorization_code',
    code
  })

  const redirectUri = options?.redirectUri === undefined ? (env.DISCORD_CALLBACK_URL ?? '') : options.redirectUri

  if (redirectUri) {
    body.set('redirect_uri', redirectUri)
  }

  return requestDiscordToken(body)
}

export async function refreshDiscordAccessToken(refreshToken: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID ?? '',
    client_secret: env.DISCORD_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })

  const redirectUri = env.DISCORD_CALLBACK_URL ?? ''

  if (redirectUri) {
    body.set('redirect_uri', redirectUri)
  }

  return requestDiscordToken(body)
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUserProfile> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    await parseDiscordError(response, 'profile fetch')
  }

  return response.json() as Promise<DiscordUserProfile>
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  const url = new URL(DISCORD_GUILDS_URL)
  url.searchParams.set('with_counts', 'true')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    await parseDiscordError(response, 'guild fetch')
  }

  return response.json() as Promise<DiscordGuildSummary[]>
}

export async function storeDiscordOauthTokens(
  userId: string,
  tokenResponse: DiscordTokenResponse,
  options?: { fallbackRefreshToken?: string | null }
) {
  await prisma.userIdentity.updateMany({
    where: {
      userId,
      provider: PrismaAuthProvider.DISCORD
    },
    data: {
      discordAccessToken: tokenResponse.access_token,
      discordRefreshToken: tokenResponse.refresh_token ?? options?.fallbackRefreshToken ?? null,
      discordAccessTokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
    }
  })
}

export async function upsertDiscordUser(
  profile: DiscordUserProfile,
  grantedScopeString = DISCORD_REQUESTED_SCOPES.join(' ')
): Promise<UpsertDiscordUserResult> {
  const email = profile.email?.toLowerCase() ?? null
  const displayName = profile.global_name?.trim() || profile.username
  const avatarUrl = buildDiscordAvatarUrl(profile)
  const grantedScopes = normalizeGrantedScopes(grantedScopeString)

  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: PrismaAuthProvider.DISCORD,
        providerUserId: profile.id
      }
    },
    include: {
      user: true
    }
  })

  if (existingIdentity) {
    const conflictingUser = email
      ? await prisma.user.findUnique({
          where: {
            email
          },
          select: {
            id: true
          }
        })
      : null

    const nextEmail = conflictingUser && conflictingUser.id !== existingIdentity.userId ? existingIdentity.user.email : email

    const updatedUser = await prisma.user.update({
      where: {
        id: existingIdentity.userId
      },
      data: {
        displayName,
        avatarUrl,
        email: nextEmail,
        lastSeenAt: new Date()
      }
    })

    await prisma.userIdentity.update({
      where: {
        id: existingIdentity.id
      },
      data: {
        email,
        grantedScopes
      }
    })

    return {
      user: updatedUser,
      isNewDiscordIdentity: false
    }
  }

  const developmentSeededHandleAlias = getDevelopmentSeededHandleAlias(profile)

  let user = developmentSeededHandleAlias
    ? await prisma.user.findUnique({
        where: {
          handle: developmentSeededHandleAlias
        }
      })
    : null

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: {
        email
      }
    })
  }

  if (!user) {
    const handle = await ensureUniqueHandle(normalizeHandleBase(displayName))
    user = await prisma.user.create({
      data: {
        handle,
        displayName,
        email,
        avatarUrl,
        lastSeenAt: new Date()
      }
    })
  } else {
    user = await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        displayName,
        avatarUrl,
        email: email ?? user.email,
        lastSeenAt: new Date()
      }
    })
  }

  await prisma.userIdentity.create({
    data: {
      userId: user.id,
      provider: PrismaAuthProvider.DISCORD,
      providerUserId: profile.id,
      email,
      grantedScopes
    }
  })

  return {
    user,
    isNewDiscordIdentity: true
  }
}

export async function markDiscordGuildSync(userId: string) {
  await prisma.userIdentity.updateMany({
    where: {
      userId,
      provider: PrismaAuthProvider.DISCORD
    },
    data: {
      lastDiscordGuildsSyncAt: new Date()
    }
  })
}