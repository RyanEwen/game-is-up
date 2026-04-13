import { Router } from 'express'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  steamLinkIntentResponseSchema,
  type AuthProvider
} from '@game-is-up/shared'
import { AuthProvider as PrismaAuthProvider } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getLatestDiscordActivityForUser } from '../lib/discord-activity.js'
import {
  DISCORD_REQUESTED_SCOPES,
  buildDiscordAuthorizationUrl,
  buildDiscordBotInstallUrl,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordUser,
  isDiscordAuthConfigured,
  markDiscordGuildSync,
  upsertDiscordUser
} from '../lib/discord-auth.js'
import { getDiscordPresenceBotState } from '../lib/discord-bot-runtime.js'
import { ensureDevelopmentSampleFriends } from '../lib/dev-sample-network.js'
import { syncDiscordServersForUser } from '../lib/discord-servers.js'
import { env } from '../lib/env.js'
import { resolveAuthRedirectTarget } from '../lib/origin.js'
import { buildSteamAuthorizationUrl, isSteamImportConfigured, upsertSteamIdentity, verifySteamOpenIdResponse } from '../lib/steam-auth.js'
import {
  clearAuthSession,
  clearDiscordState,
  consumeDiscordState,
  consumeSteamLinkState,
  createDiscordState,
  createSteamLinkState,
  getAuthSession,
  setAuthSession,
  setDiscordState,
} from '../lib/session.js'

export const authRouter = Router()

async function buildDiscordGraphCapabilities(userId: string | null) {
  if (!userId) {
    return null
  }

  const botState = getDiscordPresenceBotState()

  const identity = await prisma.userIdentity.findFirst({
    where: {
      userId,
      provider: 'DISCORD'
    },
    select: {
      grantedScopes: true,
      lastDiscordGuildsSyncAt: true
    }
  })

  if (!identity) {
    return {
      requestedScopes: [...DISCORD_REQUESTED_SCOPES],
      grantedScopes: [],
      fallbackSources: ['mutual-servers', 'app-friends'] as const,
      guildSync: {
        active: false,
        lastSyncedAt: null
      },
      activityTracking: {
        mode: 'bot-presence-lossy' as const,
        botConfigured: botState.configured,
        botConnected: botState.connected,
        botGuildCount: botState.guildCount,
        sharesServerWithBot: false,
        lastObservedAt: null,
        currentActivity: null,
        note: botState.configured
          ? 'Discord activity tracking is bot-based and lossy. It only records game activity seen in servers where the bot is installed.'
          : 'Set DISCORD_BOT_TOKEN, install the bot into shared servers, and enable the Presence Intent to record lossy Discord game activity.'
      }
    }
  }

  const [{ currentActivity, lastObservedAt }, sharedServerCount] = await Promise.all([
    getLatestDiscordActivityForUser(userId),
    botState.guildIds.length > 0
      ? prisma.discordServerMembership.count({
          where: {
            userId,
            serverId: {
              in: botState.guildIds
            }
          }
        })
      : Promise.resolve(0)
  ])

  return {
    requestedScopes: [...DISCORD_REQUESTED_SCOPES],
    grantedScopes: identity.grantedScopes,
    fallbackSources: ['mutual-servers', 'app-friends'] as const,
    guildSync: {
      active: identity.grantedScopes.includes('guilds'),
      lastSyncedAt: identity.lastDiscordGuildsSyncAt?.toISOString() ?? null
    },
    activityTracking: {
      mode: 'bot-presence-lossy' as const,
      botConfigured: botState.configured,
      botConnected: botState.connected,
      botGuildCount: botState.guildCount,
      sharesServerWithBot: sharedServerCount > 0,
      lastObservedAt,
      currentActivity,
      note: botState.configured
        ? 'Discord activity tracking is bot-based and lossy. It only records game activity seen in servers where the bot is installed.'
        : 'Set DISCORD_BOT_TOKEN, install the bot into shared servers, and enable the Presence Intent to record lossy Discord game activity.'
    }
  }
}

const steamLinkIntentRequestSchema = z.object({
  returnTo: z.string().optional()
})

function toSharedAuthProvider(provider: PrismaAuthProvider): AuthProvider {
  return provider === PrismaAuthProvider.STEAM ? 'steam' : 'discord'
}

function buildClientRedirect(authProvider: AuthProvider, redirectTarget: string, status: 'success' | 'error', options?: { reason?: string; handoff?: string }): string {
  const redirectUrl = new URL(redirectTarget)
  redirectUrl.searchParams.set('auth', authProvider)
  redirectUrl.searchParams.set('status', status)

  if (options?.reason) {
    redirectUrl.searchParams.set('reason', options.reason)
  }

  if (options?.handoff) {
    redirectUrl.searchParams.set('handoff', options.handoff)
  }

  return redirectUrl.toString()
}

authRouter.get('/providers', (_request, response) => {
  response.json(
    authProvidersResponseSchema.parse({
      providers: [
        {
          id: 'discord',
          label: 'Discord',
          enabled: isDiscordAuthConfigured(),
          primary: true,
          clientId: env.DISCORD_CLIENT_ID ?? null,
          requestedScopes: [...DISCORD_REQUESTED_SCOPES],
          installUrl: buildDiscordBotInstallUrl(),
          serverInstallUrl: buildDiscordBotInstallUrl()
        },
        {
          id: 'steam',
          label: 'Steam library import',
          enabled: isSteamImportConfigured(),
          primary: false,
          clientId: null,
          requestedScopes: ['library-read'],
          installUrl: null,
          serverInstallUrl: null
        }
      ]
    })
  )
})

authRouter.get('/me', async (request, response) => {
  const session = getAuthSession(request)

  if (!session) {
    response.json(
      authSessionResponseSchema.parse({
        authenticated: false,
        user: null,
        discordGraph: null,
        connectedProviders: []
      })
    )
    return
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.userId
    },
    select: {
      id: true,
      handle: true,
      displayName: true,
      avatarUrl: true,
      email: true,
      timezoneId: true,
      usualAvailability: true,
      discordAutoPromptPlayIntent: true,
      identities: {
        select: {
          provider: true
        }
      }
    }
  })

  if (!user) {
    clearAuthSession(response)
    response.json(
      authSessionResponseSchema.parse({
        authenticated: false,
        user: null,
        discordGraph: null,
        connectedProviders: []
      })
    )
    return
  }

  await ensureDevelopmentSampleFriends(user)

  const discordGraph = await buildDiscordGraphCapabilities(user.id)
  const connectedProviders = [...new Set(user.identities.map((identity) => toSharedAuthProvider(identity.provider)).sort((left, right) => left.localeCompare(right)))]

  response.json(
    authSessionResponseSchema.parse({
      authenticated: true,
      user: {
        ...user,
        authProvider: session.authProvider
      },
      discordGraph,
      connectedProviders
    })
  )
})

authRouter.get('/discord/login', (request, response) => {
  if (!isDiscordAuthConfigured()) {
    response.status(503).json({
      error: 'Discord OAuth is not configured.'
    })
    return
  }

  const state = createDiscordState()
  const redirectTarget = resolveAuthRedirectTarget(typeof request.query.returnTo === 'string' ? request.query.returnTo : undefined)
  setDiscordState(response, state, redirectTarget)
  response.redirect(buildDiscordAuthorizationUrl(state))
})

authRouter.get('/discord/callback', async (request, response) => {
  const error = typeof request.query.error === 'string' ? request.query.error : null
  const code = typeof request.query.code === 'string' ? request.query.code : null
  const state = typeof request.query.state === 'string' ? request.query.state : null
  const discordState = state ? consumeDiscordState(request, state) : null
  const redirectTarget = discordState?.redirectTo ?? env.CLIENT_ORIGIN

  if (error || !code || !state || !discordState) {
    clearDiscordState(response)
    response.redirect(buildClientRedirect('discord', redirectTarget, 'error', { reason: error ?? 'invalid-callback' }))
    return
  }

  try {
    const tokenResponse = await exchangeDiscordCode(code)
    const profile = await fetchDiscordUser(tokenResponse.access_token)
    const user = await upsertDiscordUser(profile, tokenResponse.scope)
    const guilds = await fetchDiscordGuilds(tokenResponse.access_token)

    await syncDiscordServersForUser(user.id, guilds)
    await markDiscordGuildSync(user.id)

    clearDiscordState(response)

    setAuthSession(response, user.id, 'discord')
    response.redirect(buildClientRedirect('discord', redirectTarget, 'success'))
  } catch (callbackError) {
    console.error('Discord callback failed', callbackError)
    clearDiscordState(response)
    response.redirect(buildClientRedirect('discord', redirectTarget, 'error', { reason: 'oauth-failed' }))
  }
})

authRouter.post('/steam/link-intent', (request, response) => {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return
  }

  if (!isSteamImportConfigured()) {
    response.status(503).json({
      error: 'Steam import is not configured.'
    })
    return
  }

  const payload = steamLinkIntentRequestSchema.parse(request.body)
  const redirectTarget = resolveAuthRedirectTarget(payload.returnTo)
  const state = createSteamLinkState(session.userId, redirectTarget)

  response.json(
    steamLinkIntentResponseSchema.parse({
      authorizationUrl: buildSteamAuthorizationUrl(state)
    })
  )
})

authRouter.get('/steam/callback', async (request, response) => {
  const state = typeof request.query.state === 'string' ? request.query.state : undefined
  const linkState = consumeSteamLinkState(state)
  const redirectTarget = linkState?.redirectTo ?? env.CLIENT_ORIGIN

  if (!linkState) {
    response.redirect(buildClientRedirect('steam', redirectTarget, 'error', { reason: 'invalid-state' }))
    return
  }

  try {
    const query = Object.fromEntries(
      Object.entries(request.query).map(([key, value]) => [key, typeof value === 'string' ? value : undefined])
    )
    const steamId = await verifySteamOpenIdResponse(query)

    await upsertSteamIdentity(linkState.userId, steamId)

    response.redirect(buildClientRedirect('steam', redirectTarget, 'success'))
  } catch (callbackError) {
    console.error('Steam callback failed', callbackError)
    response.redirect(buildClientRedirect('steam', redirectTarget, 'error', {
      reason: callbackError instanceof Error ? callbackError.message : 'steam-link-failed'
    }))
  }
})

authRouter.delete('/steam/link', async (request, response, next) => {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return
  }

  try {
    await prisma.userIdentity.deleteMany({
      where: {
        userId: session.userId,
        provider: PrismaAuthProvider.STEAM
      }
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

authRouter.post('/mobile-complete', (request, response) => {
  const parsedBody = mobileAuthCompleteRequestSchema.safeParse(request.body)

  if (!parsedBody.success) {
    response.status(400).json({
      error: 'Invalid mobile auth handoff.'
    })
    return
  }

  const handoff = consumeMobileAuthHandoff(parsedBody.data.handoff)

  if (!handoff) {
    response.status(400).json({
      error: 'This mobile auth handoff has expired.'
    })
    return
  }

  setAuthSession(response, handoff.userId, handoff.authProvider)
  response.status(204).send()
})

authRouter.post('/logout', (_request, response) => {
  clearAuthSession(response)
  response.status(204).send()
})