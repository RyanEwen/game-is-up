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

function normalizeGrantedScopes(scope: string): string[] {
  return [...new Set(scope.split(/\s+/u).map((entry) => entry.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function buildDiscordAvatarUrl(profile: DiscordUserProfile): string | null {
  if (!profile.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256`
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

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    throw new Error(`Discord token exchange failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<DiscordTokenResponse>
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUserProfile> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Discord profile fetch failed: ${response.status} ${response.statusText}`)
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
    throw new Error(`Discord guild fetch failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<DiscordGuildSummary[]>
}

export async function upsertDiscordUser(profile: DiscordUserProfile, grantedScopeString = DISCORD_REQUESTED_SCOPES.join(' ')) {
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

    return updatedUser
  }

  let user = email
    ? await prisma.user.findUnique({
        where: {
          email
        }
      })
    : null

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

  return user
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