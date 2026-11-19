/**
 * `/api/auth` — authentication entry points and the signed-in user surface.
 *
 * Owns the Discord OAuth round-trip (login, callback, link), the Steam OpenID
 * round-trip, sign-out, and the `/me` endpoint that the web app polls to
 * resolve the current session, connected providers, Discord-graph
 * capabilities, and any persisted invite attribution.
 */

import { Router } from 'express'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  steamLinkIntentResponseSchema,
  type AuthProvider,
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
  storeDiscordOauthTokens,
  upsertDiscordUser,
} from '../lib/discord-auth.js'
import { getDiscordPresenceBotState } from '../lib/discord-bot-runtime.js'
import {
  getLatestDiscordInviteAttribution,
  recordDiscordInviteAttribution,
} from '../lib/discord-invite-attribution.js'
import {
  ensureDevelopmentSampleFriends,
  ensureDevelopmentSamplePlayIntentTargets,
  ensureDevelopmentSampleServerOverlap,
} from '../lib/dev-sample-network.js'
import {
  countBotVisibleDiscordServersForUser,
  syncDiscordServersForUser,
} from '../lib/discord-servers.js'
import { env } from '../lib/env.js'
import { resolveAuthRedirectTarget } from '../lib/origin.js'
import {
  buildSteamAuthorizationUrl,
  isSteamImportConfigured,
  upsertSteamIdentity,
  verifySteamOpenIdResponse,
} from '../lib/steam-auth.js'
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
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { toClientAvatarUrl } from '../lib/game-media.js'
import { logger } from '../lib/logger.js'
import { sendError } from '../lib/http-error.js'

export const authRouter = Router()

function buildDiscordActivityTrackingNote(
  botState: ReturnType<typeof getDiscordPresenceBotState>,
) {
  if (botState.mode === 'gateway') {
    return 'Discord activity tracking is bot-based and lossy. It only records game activity seen in servers where the bot is installed.'
  }

  if (botState.mode === 'rest') {
    return 'Discord bot DMs and read-only server/member browsing are enabled in REST-only mode, but presence tracking and interactive bot flows stay disabled so production can own the live gateway connection.'
  }

  return 'Set DISCORD_BOT_TOKEN, install the bot into shared servers, and enable the Presence Intent to record lossy Discord game activity.'
}

async function buildDiscordGraphCapabilities(userId: string | null) {
  if (!userId) {
    return null
  }

  const botState = getDiscordPresenceBotState()

  const identity = await prisma.userIdentity.findFirst({
    where: {
      userId,
      provider: 'DISCORD',
    },
    select: {
      grantedScopes: true,
      lastDiscordGuildsSyncAt: true,
    },
  })

  if (!identity) {
    return {
      requestedScopes: [...DISCORD_REQUESTED_SCOPES],
      grantedScopes: [],
      fallbackSources: ['mutual-servers', 'app-friends'] as const,
      guildSync: {
        active: false,
        lastSyncedAt: null,
      },
      activityTracking: {
        mode: 'bot-presence-lossy' as const,
        botConfigured: botState.configured,
        botConnected: botState.connected,
        botGuildCount: botState.guildCount,
        sharesServerWithBot: false,
        lastObservedAt: null,
        currentActivity: null,
        note: buildDiscordActivityTrackingNote(botState),
      },
    }
  }

  const [{ currentActivity, lastObservedAt }, sharedServerCount] =
    await Promise.all([
      getLatestDiscordActivityForUser(userId),
      countBotVisibleDiscordServersForUser(userId),
    ])

  return {
    requestedScopes: [...DISCORD_REQUESTED_SCOPES],
    grantedScopes: identity.grantedScopes,
    fallbackSources: ['mutual-servers', 'app-friends'] as const,
    guildSync: {
      active: identity.grantedScopes.includes('guilds'),
      lastSyncedAt: identity.lastDiscordGuildsSyncAt?.toISOString() ?? null,
    },
    activityTracking: {
      mode: 'bot-presence-lossy' as const,
      botConfigured: botState.configured,
      botConnected: botState.connected,
      botGuildCount: botState.guildCount,
      sharesServerWithBot: sharedServerCount > 0,
      lastObservedAt,
      currentActivity,
      note: buildDiscordActivityTrackingNote(botState),
    },
  }
}
const steamLinkIntentRequestSchema = z.object({
  returnTo: z.string().optional(),
})

function toSharedAuthProvider(provider: PrismaAuthProvider): AuthProvider {
  return provider === PrismaAuthProvider.STEAM ? 'steam' : 'discord'
}

function buildClientRedirect(
  authProvider: AuthProvider,
  redirectTarget: string,
  status: 'success' | 'error',
  options?: { reason?: string; handoff?: string },
): string {
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
          serverInstallUrl: buildDiscordBotInstallUrl(),
        },
        {
          id: 'steam',
          label: 'Steam library import',
          enabled: isSteamImportConfigured(),
          primary: false,
          clientId: null,
          requestedScopes: ['library-read'],
          installUrl: null,
          serverInstallUrl: null,
        },
      ],
    }),
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
        inviteAttribution: null,
        connectedProviders: [],
      }),
    )
    return
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.userId,
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
      isAdmin: true,
      identities: {
        select: {
          provider: true,
        },
      },
    },
  })

  if (!user) {
    clearAuthSession(response)
    response.json(
      authSessionResponseSchema.parse({
        authenticated: false,
        user: null,
        discordGraph: null,
        inviteAttribution: null,
        connectedProviders: [],
      }),
    )
    return
  }

  const adminHandles = env.ADMIN_HANDLES
    ? env.ADMIN_HANDLES.split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    : []
  const shouldBeAdmin = adminHandles.includes(user.handle.toLowerCase())
  if (shouldBeAdmin !== user.isAdmin) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: shouldBeAdmin },
    })
    user.isAdmin = shouldBeAdmin
  }

  await ensureDevelopmentSampleFriends(user)
  await ensureDevelopmentSampleServerOverlap(user)
  await ensureDevelopmentSamplePlayIntentTargets(user)

  const [discordGraph, inviteAttribution] = await Promise.all([
    buildDiscordGraphCapabilities(user.id),
    getLatestDiscordInviteAttribution(user.id),
  ])
  const connectedProviders = [
    ...new Set(
      user.identities
        .map((identity) => toSharedAuthProvider(identity.provider))
        .sort((left, right) => left.localeCompare(right)),
    ),
  ]

  response.json(
    authSessionResponseSchema.parse({
      authenticated: true,
      user: {
        ...user,
        avatarUrl: toClientAvatarUrl(user.avatarUrl),
        authProvider: session.authProvider,
      },
      discordGraph,
      inviteAttribution,
      connectedProviders,
    }),
  )
})

authRouter.get('/discord/login', (request, response) => {
  if (!isDiscordAuthConfigured()) {
    sendError(response, 503, 'Discord OAuth is not configured.')
    return
  }

  const state = createDiscordState()
  const redirectTarget = resolveAuthRedirectTarget(
    typeof request.query.returnTo === 'string'
      ? request.query.returnTo
      : undefined,
  )
  setDiscordState(response, state, redirectTarget)
  response.redirect(buildDiscordAuthorizationUrl(state))
})

authRouter.get('/discord/callback', async (request, response) => {
  const error =
    typeof request.query.error === 'string' ? request.query.error : null
  const code =
    typeof request.query.code === 'string' ? request.query.code : null
  const state =
    typeof request.query.state === 'string' ? request.query.state : null
  const discordState = state ? consumeDiscordState(request, state) : null
  const redirectTarget = discordState?.redirectTo ?? env.CLIENT_ORIGIN

  if (error || !code || !state || !discordState) {
    clearDiscordState(response)
    response.redirect(
      buildClientRedirect('discord', redirectTarget, 'error', {
        reason: error ?? 'invalid-callback',
      }),
    )
    return
  }

  try {
    const tokenResponse = await exchangeDiscordCode(code)
    const profile = await fetchDiscordUser(tokenResponse.access_token)
    const userResult = await upsertDiscordUser(profile, tokenResponse.scope)
    await storeDiscordOauthTokens(userResult.user.id, tokenResponse)
    const guilds = await fetchDiscordGuilds(tokenResponse.access_token)

    await syncDiscordServersForUser(userResult.user.id, guilds)
    await markDiscordGuildSync(userResult.user.id)

    if (userResult.isNewDiscordIdentity) {
      await recordDiscordInviteAttribution({
        acceptedUserId: userResult.user.id,
        acceptedDiscordUserId: profile.id,
        redirectTarget,
      })
    }

    clearDiscordState(response)

    setAuthSession(response, userResult.user.id, 'discord')
    publishDashboardInvalidation({
      domains: ['auth', 'network', 'discovery', 'play-intents'],
    })
    response.redirect(buildClientRedirect('discord', redirectTarget, 'success'))
  } catch (callbackError) {
    logger.error('Discord callback failed', { error: callbackError })
    clearDiscordState(response)
    response.redirect(
      buildClientRedirect('discord', redirectTarget, 'error', {
        reason: 'oauth-failed',
      }),
    )
  }
})

authRouter.post('/steam/link-intent', (request, response) => {
  const session = getAuthSession(request)

  if (!session) {
    sendError(response, 401, 'Authentication required.')
    return
  }

  if (!isSteamImportConfigured()) {
    sendError(response, 503, 'Steam import is not configured.')
    return
  }

  const payload = steamLinkIntentRequestSchema.parse(request.body)
  const redirectTarget = resolveAuthRedirectTarget(payload.returnTo)
  const state = createSteamLinkState(session.userId, redirectTarget)

  response.json(
    steamLinkIntentResponseSchema.parse({
      authorizationUrl: buildSteamAuthorizationUrl(state),
    }),
  )
})

authRouter.get('/steam/callback', async (request, response) => {
  const state =
    typeof request.query.state === 'string' ? request.query.state : undefined
  const linkState = consumeSteamLinkState(state)
  const redirectTarget = linkState?.redirectTo ?? env.CLIENT_ORIGIN

  if (!linkState) {
    response.redirect(
      buildClientRedirect('steam', redirectTarget, 'error', {
        reason: 'invalid-state',
      }),
    )
    return
  }

  try {
    const query = Object.fromEntries(
      Object.entries(request.query).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : undefined,
      ]),
    )
    const steamId = await verifySteamOpenIdResponse(query)

    await upsertSteamIdentity(linkState.userId, steamId)
    publishDashboardInvalidation({
      domains: ['auth', 'library'],
      userIds: [linkState.userId],
    })

    response.redirect(buildClientRedirect('steam', redirectTarget, 'success'))
  } catch (callbackError) {
    logger.error('Steam callback failed', { error: callbackError })
    response.redirect(
      buildClientRedirect('steam', redirectTarget, 'error', {
        reason:
          callbackError instanceof Error
            ? callbackError.message
            : 'steam-link-failed',
      }),
    )
  }
})

authRouter.delete('/steam/link', async (request, response, next) => {
  const session = getAuthSession(request)

  if (!session) {
    sendError(response, 401, 'Authentication required.')
    return
  }

  try {
    await prisma.userIdentity.deleteMany({
      where: {
        userId: session.userId,
        provider: PrismaAuthProvider.STEAM,
      },
    })

    publishDashboardInvalidation({
      domains: ['auth', 'library'],
      userIds: [session.userId],
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', (request, response) => {
  const session = getAuthSession(request)

  if (session) {
    publishDashboardInvalidation({
      domains: ['auth'],
      userIds: [session.userId],
    })
  }

  clearAuthSession(response)
  response.status(204).send()
})
