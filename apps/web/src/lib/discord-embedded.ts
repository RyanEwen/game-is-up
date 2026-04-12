import type {
  ExchangeDiscordEmbeddedCodeResponse,
  ImportDiscordFriendsRequest,
  ImportDiscordFriendsResponse
} from '@game-is-up/shared'

const DISCORD_RELATIONSHIP_SCOPE = ['applications.commands', 'identify', 'relationships.read'] as const
const DISCORD_EMBEDDED_AUTH_SCOPES = ['applications.commands', 'identify', 'email', 'guilds', 'relationships.read'] as const

type EmbeddedAuthScope = (typeof DISCORD_EMBEDDED_AUTH_SCOPES)[number]

type EmbeddedRelationship = {
  type: number;
  user: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
};

function isEmbeddedAuthScope(value: string): value is EmbeddedAuthScope {
  return (DISCORD_EMBEDDED_AUTH_SCOPES as readonly string[]).includes(value)
}

export function isDiscordEmbeddedActivity(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top
}

function buildDiscordAvatarUrl(user: EmbeddedRelationship['user']): string | null {
  if (!user.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
}

function mapRelationshipType(type: number): ImportDiscordFriendsRequest['friends'][number]['relationshipType'] | null {
  switch (type) {
    case 1:
      return 'friend'
    case 2:
      return 'blocked'
    case 3:
      return 'pending-incoming'
    case 4:
      return 'pending-outgoing'
    default:
      return null
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export async function syncDiscordFriendsFromEmbeddedSdk(options: {
  clientId: string;
  apiBaseUrl: string;
}): Promise<ImportDiscordFriendsResponse> {
  const { clientId, apiBaseUrl } = options
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, '')

  if (!isDiscordEmbeddedActivity()) {
    throw new Error('Discord friend sync must be launched from the Game Is Up activity inside Discord.')
  }

  const { DiscordSDK } = await import('@discord/embedded-app-sdk')
  const discordSdk = new DiscordSDK(clientId)

  await withTimeout(discordSdk.ready(), 5000, 'Discord Embedded App SDK is not available in this browser context.')

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: [...DISCORD_RELATIONSHIP_SCOPE]
  })

  const tokenResponse = await fetch(`${normalizedApiBaseUrl}/api/auth/discord/token`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code })
  })

  if (!tokenResponse.ok) {
    const responseBody = (await tokenResponse.json().catch(() => null)) as { error?: string } | null
    throw new Error(responseBody?.error ?? 'Unable to exchange the Discord embedded authorization code.')
  }

  const tokenPayload = (await tokenResponse.json()) as ExchangeDiscordEmbeddedCodeResponse

  await discordSdk.commands.authenticate({
    access_token: tokenPayload.accessToken
  })

  const { relationships } = await discordSdk.commands.getRelationships() as { relationships: EmbeddedRelationship[] }
  const friends = relationships
    .map((relationship) => {
      const relationshipType = mapRelationshipType(relationship.type)

      if (!relationshipType) {
        return null
      }

      return {
        discordUserId: relationship.user.id,
        username: relationship.user.username,
        displayName: relationship.user.global_name?.trim() || relationship.user.username,
        avatarUrl: buildDiscordAvatarUrl(relationship.user),
        relationshipType
      }
    })
    .filter((relationship): relationship is ImportDiscordFriendsRequest['friends'][number] => relationship != null)

  const importResponse = await fetch(`${normalizedApiBaseUrl}/api/discord-friends/me/import`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenPayload.accessToken}`
    },
    body: JSON.stringify({ friends })
  })

  if (!importResponse.ok) {
    const responseBody = (await importResponse.json().catch(() => null)) as { error?: string } | null
    throw new Error(responseBody?.error ?? 'Unable to import Discord friends into Game Is Up.')
  }

  return await importResponse.json() as ImportDiscordFriendsResponse
}

export async function signInWithDiscordFromEmbeddedSdk(options: {
  clientId: string;
  apiBaseUrl: string;
  scopes: readonly string[];
}): Promise<void> {
  const { clientId, apiBaseUrl, scopes } = options
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, '')

  if (!isDiscordEmbeddedActivity()) {
    throw new Error('Discord sign-in must be launched from the Game Is Up activity inside Discord.')
  }

  const requestedScopes = [...new Set(scopes.map((scope) => scope.trim()).filter(isEmbeddedAuthScope))]

  if (requestedScopes.length === 0) {
    throw new Error('Discord sign-in is unavailable because no OAuth scopes are configured.')
  }

  const { DiscordSDK } = await import('@discord/embedded-app-sdk')
  const discordSdk = new DiscordSDK(clientId)

  await withTimeout(discordSdk.ready(), 5000, 'Discord Embedded App SDK is not available in this browser context.')

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: requestedScopes
  })

  const tokenResponse = await fetch(`${normalizedApiBaseUrl}/api/auth/discord/token`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code })
  })

  if (!tokenResponse.ok) {
    const responseBody = (await tokenResponse.json().catch(() => null)) as { error?: string } | null
    throw new Error(responseBody?.error ?? 'Unable to exchange the Discord embedded authorization code.')
  }

  const tokenPayload = (await tokenResponse.json()) as ExchangeDiscordEmbeddedCodeResponse

  await discordSdk.commands.authenticate({
    access_token: tokenPayload.accessToken
  })
}