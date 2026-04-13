import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import { prisma } from './prisma.js'
import { env } from './env.js'

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'
const STEAM_PLAYER_SUMMARIES_URL = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/'
const STEAM_OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'
const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const OPENID_IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

type SteamPlayerSummaryResponse = {
  response: {
    players: Array<{
      steamid: string;
      personaname: string;
      avatarfull?: string;
      profileurl?: string;
    }>;
  };
};

type SteamOwnedGamesResponse = {
  response?: {
    game_count?: number;
    games?: Array<{
      appid: number;
      name?: string;
      playtime_forever?: number;
      playtime_2weeks?: number;
    }>;
  };
};

export type SteamProfileSummary = {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
};

export type SteamOwnedGame = {
  sourceId: string;
  title: string;
  coverUrl: string | null;
  platformLabels: string[];
  minutesPlayedTotal: number;
  minutesPlayedRecent: number;
};

function requireSteamConfig() {
  if (!env.STEAM_CALLBACK_URL || !env.STEAM_WEB_API_KEY) {
    throw new Error('Steam import is not configured.')
  }
}

function buildSteamGameCoverUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
}

function extractSteamIdFromClaimedId(claimedId: string): string | null {
  const match = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/u)

  return match?.[1] ?? null
}

function parseOpenIdVerificationResponse(body: string): boolean {
  return body.split('\n').some((line) => line.trim() === 'is_valid:true')
}

export function isSteamImportConfigured(): boolean {
  return Boolean(env.STEAM_CALLBACK_URL && env.STEAM_WEB_API_KEY)
}

export function buildSteamAuthorizationUrl(state: string): string {
  requireSteamConfig()

  const returnTo = new URL(env.STEAM_CALLBACK_URL ?? '')
  returnTo.searchParams.set('state', state)

  const url = new URL(STEAM_OPENID_URL)
  url.searchParams.set('openid.ns', OPENID_NS)
  url.searchParams.set('openid.mode', 'checkid_setup')
  url.searchParams.set('openid.claimed_id', OPENID_IDENTIFIER_SELECT)
  url.searchParams.set('openid.identity', OPENID_IDENTIFIER_SELECT)
  url.searchParams.set('openid.return_to', returnTo.toString())
  url.searchParams.set('openid.realm', returnTo.origin)

  return url.toString()
}

export async function verifySteamOpenIdResponse(query: Record<string, string | undefined>): Promise<string> {
  requireSteamConfig()

  const claimedId = query['openid.claimed_id']
  const returnTo = query['openid.return_to']

  if (!claimedId || !returnTo) {
    throw new Error('Steam did not return a valid OpenID response.')
  }

  const configuredCallback = new URL(env.STEAM_CALLBACK_URL ?? '')
  const actualReturnTo = new URL(returnTo)

  if (actualReturnTo.origin !== configuredCallback.origin || actualReturnTo.pathname !== configuredCallback.pathname) {
    throw new Error('Steam returned an unexpected callback URL.')
  }

  const verificationPayload = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.') && value) {
      verificationPayload.set(key, value)
    }
  }

  verificationPayload.set('openid.mode', 'check_authentication')

  const response = await fetch(STEAM_OPENID_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: verificationPayload
  })

  if (!response.ok) {
    throw new Error(`Steam OpenID verification failed: ${response.status} ${response.statusText}`)
  }

  const verificationText = await response.text()

  if (!parseOpenIdVerificationResponse(verificationText)) {
    throw new Error('Steam OpenID verification was rejected.')
  }

  const steamId = extractSteamIdFromClaimedId(claimedId)

  if (!steamId) {
    throw new Error('Steam did not return a valid Steam ID.')
  }

  return steamId
}

export async function fetchSteamProfileSummary(steamId: string): Promise<SteamProfileSummary> {
  requireSteamConfig()

  const url = new URL(STEAM_PLAYER_SUMMARIES_URL)
  url.searchParams.set('key', env.STEAM_WEB_API_KEY ?? '')
  url.searchParams.set('steamids', steamId)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Steam profile lookup failed: ${response.status} ${response.statusText}`)
  }

  const parsed = (await response.json()) as SteamPlayerSummaryResponse
  const player = parsed.response.players[0]

  if (!player) {
    throw new Error('Steam did not return a player profile for this account.')
  }

  return {
    steamId: player.steamid,
    displayName: player.personaname,
    avatarUrl: player.avatarfull ?? null,
    profileUrl: player.profileurl ?? null
  }
}

export async function fetchSteamOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
  requireSteamConfig()

  const url = new URL(STEAM_OWNED_GAMES_URL)
  url.searchParams.set('key', env.STEAM_WEB_API_KEY ?? '')
  url.searchParams.set('steamid', steamId)
  url.searchParams.set('include_appinfo', 'true')
  url.searchParams.set('include_played_free_games', 'true')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Steam library lookup failed: ${response.status} ${response.statusText}`)
  }

  const parsed = (await response.json()) as SteamOwnedGamesResponse
  const games = parsed.response?.games ?? []

  return games
    .filter((game) => typeof game.appid === 'number' && Boolean(game.name?.trim()))
    .map((game) => ({
      sourceId: game.appid.toString(),
      title: game.name?.trim() ?? 'Unknown Steam title',
      coverUrl: buildSteamGameCoverUrl(game.appid),
      platformLabels: ['PC'],
      minutesPlayedTotal: game.playtime_forever ?? 0,
      minutesPlayedRecent: game.playtime_2weeks ?? 0
    }))
    .sort((left, right) => {
      if (right.minutesPlayedRecent !== left.minutesPlayedRecent) {
        return right.minutesPlayedRecent - left.minutesPlayedRecent
      }

      if (right.minutesPlayedTotal !== left.minutesPlayedTotal) {
        return right.minutesPlayedTotal - left.minutesPlayedTotal
      }

      return left.title.localeCompare(right.title)
    })
}

export async function upsertSteamIdentity(userId: string, steamId: string) {
  const [identityForSteamId, identityForUser] = await Promise.all([
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: PrismaAuthProvider.STEAM,
          providerUserId: steamId
        }
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        userId,
        provider: PrismaAuthProvider.STEAM
      }
    })
  ])

  if (identityForSteamId && identityForSteamId.userId !== userId) {
    throw new Error("That Steam account is already linked to another Game's Up user.")
  }

  if (identityForUser) {
    return prisma.userIdentity.update({
      where: {
        id: identityForUser.id
      },
      data: {
        providerUserId: steamId,
        email: null,
        grantedScopes: ['library-read']
      }
    })
  }

  return prisma.userIdentity.create({
    data: {
      userId,
      provider: PrismaAuthProvider.STEAM,
      providerUserId: steamId,
      email: null,
      grantedScopes: ['library-read']
    }
  })
}
