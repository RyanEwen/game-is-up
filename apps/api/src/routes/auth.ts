import { Router } from 'express'
import { authProvidersResponseSchema, authSessionResponseSchema } from '@game-is-up/shared'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getLatestDiscordActivityForUser } from '../lib/discord-activity.js'
import {
  DISCORD_APPROVAL_GATED_SCOPES,
  DISCORD_REQUESTED_SCOPES,
  buildDiscordAuthorizationUrl,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordUser,
  isDiscordAuthConfigured,
  markDiscordGuildSync,
  upsertDiscordUser
} from '../lib/discord-auth.js'
import { getDiscordPresenceBotState } from '../lib/discord-presence-bot.js'
import { syncDiscordServersForUser } from '../lib/discord-servers.js'
import { env } from '../lib/env.js'
import { isMobileAuthRedirectTarget, resolveAuthRedirectTarget } from '../lib/origin.js'
import {
  clearAuthSession,
  clearDiscordState,
  consumeDiscordState,
  consumeMobileAuthHandoff,
  createMobileAuthHandoff,
  createDiscordState,
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
      lastDiscordGuildsSyncAt: true,
      lastDiscordRelationshipsSyncAt: true,
      discordRelationshipSyncStatus: true,
      discordRelationshipSyncError: true
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
      relationshipSync: {
        available: false,
        requiresApproval: true,
        status: 'approval-required' as const,
        lastSyncedAt: null,
        error: null
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

  const relationshipStatusMap = {
    APPROVAL_REQUIRED: 'approval-required',
    SCOPE_MISSING: 'scope-missing',
    READY: 'ready',
    SYNCED: 'synced',
    ERROR: 'error'
  } as const

  const relationshipStatus = relationshipStatusMap[identity.discordRelationshipSyncStatus]
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
    relationshipSync: {
      available: relationshipStatus === 'ready' || relationshipStatus === 'synced',
      requiresApproval: !identity.grantedScopes.includes('relationships.read'),
      status: relationshipStatus,
      lastSyncedAt: identity.lastDiscordRelationshipsSyncAt?.toISOString() ?? null,
      error: identity.discordRelationshipSyncError
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

const mobileAuthCompleteRequestSchema = z.object({
  handoff: z.string().min(1)
})

function buildClientRedirect(redirectTarget: string, status: 'success' | 'error', options?: { reason?: string; handoff?: string }): string {
  const redirectUrl = new URL(redirectTarget)
  redirectUrl.searchParams.set('auth', 'discord')
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
          requestedScopes: [...DISCORD_REQUESTED_SCOPES],
          gatedScopes: [...DISCORD_APPROVAL_GATED_SCOPES]
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
        discordGraph: null
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
      usualAvailability: true
    }
  })

  if (!user) {
    clearAuthSession(response)
    response.json(
      authSessionResponseSchema.parse({
        authenticated: false,
        user: null,
        discordGraph: null
      })
    )
    return
  }

  const discordGraph = await buildDiscordGraphCapabilities(user.id)

  response.json(
    authSessionResponseSchema.parse({
      authenticated: true,
      user: {
        ...user,
        authProvider: session.authProvider
      },
      discordGraph
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
    response.redirect(buildClientRedirect(redirectTarget, 'error', { reason: error ?? 'invalid-callback' }))
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

    if (isMobileAuthRedirectTarget(redirectTarget)) {
      const handoff = createMobileAuthHandoff(user.id, 'discord')
      response.redirect(buildClientRedirect(redirectTarget, 'success', { handoff }))
      return
    }

    setAuthSession(response, user.id, 'discord')
    response.redirect(buildClientRedirect(redirectTarget, 'success'))
  } catch (callbackError) {
    console.error('Discord callback failed', callbackError)
    clearDiscordState(response)
    response.redirect(buildClientRedirect(redirectTarget, 'error', { reason: 'oauth-failed' }))
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