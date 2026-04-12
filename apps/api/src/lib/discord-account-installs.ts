import { createPublicKey, type KeyObject, verify } from 'node:crypto'
import type { DiscordAccountInstall } from '@game-is-up/shared'
import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import { prisma } from './prisma.js'
import { env } from './env.js'

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const DISCORD_USER_INSTALL_SCOPES = ['applications.commands'] as const
const DISCORD_ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

type DiscordInstallUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

let discordWebhookPublicKey: KeyObject | null | undefined

function buildDiscordAvatarUrl(user: DiscordInstallUser): string | null {
  if (!user.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
}

function normalizeGrantedScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((entry) => entry.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

async function findLinkedUserId(discordUserId: string): Promise<string | null> {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: PrismaAuthProvider.DISCORD,
        providerUserId: discordUserId
      }
    },
    select: {
      userId: true
    }
  })

  return identity?.userId ?? null
}

function buildInstallNote(status: DiscordAccountInstall['status'], trackingConfigured: boolean): string {
  if (status === 'installed') {
    return 'Game Is Up is installed on this Discord account.'
  }

  if (status === 'removed') {
    return 'Discord reported that Game Is Up was removed from this account. Install it again to keep Discord-friend invites available.'
  }

  if (status === 'missing') {
    return 'Install Game Is Up on your Discord account so friends can invite you from the Discord friends row.'
  }

  return trackingConfigured
    ? 'Sign in with Discord to track whether Game Is Up is installed on this account.'
    : 'Configure Discord event webhooks to confirm whether Game Is Up is installed or removed on this account.'
}

export function isDiscordEventWebhookConfigured(): boolean {
  return Boolean(env.DISCORD_APPLICATION_PUBLIC_KEY)
}

export function buildDiscordUserInstallUrl(): string | null {
  if (!env.DISCORD_CLIENT_ID) {
    return null
  }

  const url = new URL(DISCORD_AUTHORIZE_URL)
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  url.searchParams.set('scope', DISCORD_USER_INSTALL_SCOPES.join(' '))
  url.searchParams.set('integration_type', '1')

  return url.toString()
}

export async function attachDiscordAccountInstallToUser(discordUserId: string, userId: string) {
  await prisma.discordAccountInstall.updateMany({
    where: {
      discordUserId
    },
    data: {
      userId
    }
  })
}

export async function recordDiscordAccountAuthorized(options: {
  discordUser: DiscordInstallUser;
  grantedScopes: readonly string[];
  occurredAt?: Date;
}) {
  const { discordUser, grantedScopes, occurredAt = new Date() } = options
  const linkedUserId = await findLinkedUserId(discordUser.id)
  const displayName = discordUser.global_name?.trim() || discordUser.username

  await prisma.discordAccountInstall.upsert({
    where: {
      discordUserId: discordUser.id
    },
    update: {
      userId: linkedUserId ?? undefined,
      username: discordUser.username,
      displayName,
      avatarUrl: buildDiscordAvatarUrl(discordUser),
      installed: true,
      grantedScopes: normalizeGrantedScopes(grantedScopes),
      lastAuthorizedAt: occurredAt
    },
    create: {
      userId: linkedUserId ?? undefined,
      discordUserId: discordUser.id,
      username: discordUser.username,
      displayName,
      avatarUrl: buildDiscordAvatarUrl(discordUser),
      installed: true,
      grantedScopes: normalizeGrantedScopes(grantedScopes),
      lastAuthorizedAt: occurredAt
    }
  })
}

export async function recordDiscordAccountDeauthorized(options: {
  discordUser: DiscordInstallUser;
  occurredAt?: Date;
}) {
  const { discordUser, occurredAt = new Date() } = options
  const linkedUserId = await findLinkedUserId(discordUser.id)
  const displayName = discordUser.global_name?.trim() || discordUser.username

  await prisma.discordAccountInstall.upsert({
    where: {
      discordUserId: discordUser.id
    },
    update: {
      userId: linkedUserId ?? undefined,
      username: discordUser.username,
      displayName,
      avatarUrl: buildDiscordAvatarUrl(discordUser),
      installed: false,
      lastDeauthorizedAt: occurredAt
    },
    create: {
      userId: linkedUserId ?? undefined,
      discordUserId: discordUser.id,
      username: discordUser.username,
      displayName,
      avatarUrl: buildDiscordAvatarUrl(discordUser),
      installed: false,
      lastDeauthorizedAt: occurredAt
    }
  })
}

export async function getDiscordAccountInstallSummaryForUser(userId: string): Promise<DiscordAccountInstall> {
  const installUrl = buildDiscordUserInstallUrl()
  const trackingConfigured = isDiscordEventWebhookConfigured()
  const identity = await prisma.userIdentity.findFirst({
    where: {
      userId,
      provider: PrismaAuthProvider.DISCORD
    },
    select: {
      providerUserId: true
    }
  })

  if (!identity) {
    return {
      installUrl,
      status: 'unknown',
      lastAuthorizedAt: null,
      lastDeauthorizedAt: null,
      note: buildInstallNote('unknown', trackingConfigured)
    }
  }

  await attachDiscordAccountInstallToUser(identity.providerUserId, userId)

  const install = await prisma.discordAccountInstall.findFirst({
    where: {
      OR: [
        {
          userId
        },
        {
          discordUserId: identity.providerUserId
        }
      ]
    },
    orderBy: {
      updatedAt: 'desc'
    }
  })

  const status = install?.installed
    ? 'installed'
    : install
      ? 'removed'
      : trackingConfigured
        ? 'missing'
        : 'unknown'

  return {
    installUrl,
    status,
    lastAuthorizedAt: install?.lastAuthorizedAt?.toISOString() ?? null,
    lastDeauthorizedAt: install?.lastDeauthorizedAt?.toISOString() ?? null,
    note: buildInstallNote(status, trackingConfigured)
  }
}

function getDiscordWebhookPublicKey(): KeyObject | null {
  if (discordWebhookPublicKey !== undefined) {
    return discordWebhookPublicKey
  }

  if (!env.DISCORD_APPLICATION_PUBLIC_KEY) {
    discordWebhookPublicKey = null
    return discordWebhookPublicKey
  }

  try {
    const rawPublicKey = Buffer.from(env.DISCORD_APPLICATION_PUBLIC_KEY, 'hex')
    discordWebhookPublicKey = createPublicKey({
      key: Buffer.concat([DISCORD_ED25519_SPKI_PREFIX, rawPublicKey]),
      format: 'der',
      type: 'spki'
    })
  } catch (error) {
    console.error('Invalid Discord application public key', error)
    discordWebhookPublicKey = null
  }

  return discordWebhookPublicKey
}

export function verifyDiscordEventSignature(signatureHex: string, timestamp: string, rawBody: Buffer): boolean {
  const publicKey = getDiscordWebhookPublicKey()

  if (!publicKey) {
    return false
  }

  try {
    return verify(null, Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]), publicKey, Buffer.from(signatureHex, 'hex'))
  } catch {
    return false
  }
}