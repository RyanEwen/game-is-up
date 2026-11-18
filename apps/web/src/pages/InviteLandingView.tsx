import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  CssBaseline,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { CssVarsProvider } from '@mui/joy/styles'
import {
  authSessionResponseSchema,
  type AuthSessionResponse,
} from '@game-is-up/shared'
import { useChromeCssVars } from '../hooks/useChromeCssVars'
import { appThemeVariants, DEFAULT_APP_THEME } from '../theme/themes'

type InviteLandingDetails = {
  serverName: string | null
  inviterLabel: string | null
  memberCount: number | null
  kind: 'direct' | 'server'
}

type InviteAuthState = {
  tone: 'success' | 'danger' | 'primary'
  title: string
  body: string
} | null

const ambientSpectrumGradient =
  'linear-gradient(115deg, #7dff92 0%, #49ff66 22%, #2fe07f 54%, #8bff7a 100%)'

function parseInviteDetails(url: URL): InviteLandingDetails {
  const serverName = url.searchParams.get('server')?.trim() || null
  const inviterLabel = url.searchParams.get('inviter')?.trim() || null
  const kind = url.searchParams.get('kind') === 'direct' ? 'direct' : 'server'
  const rawMemberCount = Number(url.searchParams.get('members') ?? '')
  const memberCount =
    Number.isFinite(rawMemberCount) && rawMemberCount >= 0
      ? rawMemberCount
      : null

  return {
    serverName,
    inviterLabel,
    memberCount,
    kind,
  }
}

function parseAuthState(url: URL): InviteAuthState {
  const auth = url.searchParams.get('auth')
  const status = url.searchParams.get('status')

  if (auth !== 'discord' || !status) {
    return null
  }

  if (status === 'success') {
    return {
      tone: 'success',
      title: 'Discord connected',
      body: "Your Game's Up session is ready. Open the app to add friends, compare libraries, and jump into calls to play.",
    }
  }

  return {
    tone: 'danger',
    title: 'Sign-in did not finish',
    body: 'Try again with Discord. If the problem keeps happening, open the app directly and start sign-in there.',
  }
}

function buildInviteHeadline(details: InviteLandingDetails) {
  if (details.inviterLabel && details.serverName) {
    return `${details.inviterLabel} invited you through ${details.serverName}`
  }

  if (details.inviterLabel) {
    return `${details.inviterLabel} invited you to Game's Up`
  }

  if (details.serverName) {
    return `Join Game's Up through ${details.serverName}`
  }

  return "Join Game's Up"
}

function buildMemberCountCopy(
  memberCount: number | null,
  serverName: string | null,
) {
  if (memberCount == null) {
    return 'Sign in with Discord to see who is already around, compare libraries, and turn a quick idea into a real session.'
  }

  if (memberCount === 0) {
    return serverName
      ? `Be the first person from ${serverName} on Game's Up.`
      : "Be the first person from your group on Game's Up."
  }

  return serverName
    ? `${memberCount} ${memberCount === 1 ? 'person from' : 'people from'} ${serverName} already ${memberCount === 1 ? 'uses' : 'use'} Game's Up.`
    : `${memberCount} ${memberCount === 1 ? 'person is' : 'people are'} already on Game's Up.`
}

function stripAuthParams(url: URL) {
  const nextUrl = new URL(url.toString())

  nextUrl.searchParams.delete('auth')
  nextUrl.searchParams.delete('status')
  nextUrl.searchParams.delete('reason')
  nextUrl.searchParams.delete('handoff')

  return nextUrl
}

function buildDiscordLoginUrl(returnTo: string) {
  return `/api/auth/discord/login?returnTo=${encodeURIComponent(returnTo)}`
}

export function InviteLandingView() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  const { cleanInviteUrl, details, authState } = useMemo(() => {
    const currentUrl = new URL(window.location.href)
    return {
      cleanInviteUrl: stripAuthParams(currentUrl).toString(),
      details: parseInviteDetails(currentUrl),
      authState: parseAuthState(currentUrl),
    }
  }, [])

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const nextUrl = stripAuthParams(currentUrl)

    if (currentUrl.toString() !== nextUrl.toString()) {
      window.history.replaceState({}, document.title, nextUrl.toString())
    }
  }, [])

  useEffect(() => {
    document.title =
      authState?.tone === 'success'
        ? "Game's Up • Invite Accepted"
        : "Game's Up • Invite"
  }, [authState])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        })
        const responseJson = await response.json()

        if (cancelled) {
          return
        }

        setSession(authSessionResponseSchema.parse(responseJson))
      } catch {
        if (!cancelled) {
          setSession(null)
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const isAuthenticated = Boolean(session?.authenticated)

  // Invite landing is a brand surface: it always renders the app default theme.
  useChromeCssVars(appThemeVariants[DEFAULT_APP_THEME].chromeCssVars)

  return (
    <CssVarsProvider
      theme={appThemeVariants[DEFAULT_APP_THEME].theme}
      defaultMode="dark"
    >
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          position: 'relative',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 5 },
          background:
            'linear-gradient(180deg, rgba(8, 16, 14, 0.14) 0px, rgba(7, 13, 12, 0.22) 240px, rgba(6, 10, 9, 0.72) 100%)',
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundImage: [
              'radial-gradient(circle at 16% 18%, rgba(73, 255, 102, 0.18), transparent 24%)',
              'radial-gradient(circle at 84% 14%, rgba(139, 255, 122, 0.14), transparent 28%)',
              ambientSpectrumGradient,
            ].join(','),
            backgroundBlendMode: 'screen, screen, normal',
            backgroundSize: 'auto, auto, 100% 100%',
            backgroundPosition: 'center, center, center',
            opacity: 0.12,
            pointerEvents: 'none',
          }}
        />

        <Stack
          spacing={3}
          sx={{ position: 'relative', zIndex: 1, maxWidth: 880, mx: 'auto' }}
        >
          <Sheet
            variant="plain"
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 'xl',
              border: '1px solid #272f3c',
              background: 'linear-gradient(135deg, #10182b, #16233a)',
              boxShadow: 'xl',
            }}
          >
            <Stack spacing={3}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  <Chip color="primary" variant="soft">
                    Discord invite
                  </Chip>
                  {details.kind === 'direct' ? (
                    <Chip color="warning" variant="soft">
                      Direct invite
                    </Chip>
                  ) : null}
                  {details.serverName ? (
                    <Chip color="neutral" variant="outlined">
                      {details.serverName}
                    </Chip>
                  ) : null}
                </Stack>
                <Typography
                  level="h1"
                  sx={{
                    fontSize: { xs: '2.25rem', md: '3.5rem' },
                    maxWidth: 720,
                  }}
                >
                  {buildInviteHeadline(details)}
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: 'neutral.200', maxWidth: 720 }}
                >
                  {buildMemberCountCopy(
                    details.memberCount,
                    details.serverName,
                  )}
                </Typography>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  size="lg"
                  color="primary"
                  onClick={() => {
                    window.location.assign(
                      isAuthenticated
                        ? '/play'
                        : buildDiscordLoginUrl(cleanInviteUrl),
                    )
                  }}
                >
                  {isAuthenticated ? "Open Game's Up" : 'Continue with Discord'}
                </Button>
                <Button
                  size="lg"
                  variant="outlined"
                  color="neutral"
                  onClick={() => {
                    window.location.assign('/overview')
                  }}
                >
                  Explore the app
                </Button>
              </Stack>

              {authState ? (
                <Card color={authState.tone} variant="soft" sx={{ p: 2.5 }}>
                  <Stack spacing={0.75}>
                    <Typography level="title-md">{authState.title}</Typography>
                    <Typography level="body-sm">{authState.body}</Typography>
                  </Stack>
                </Card>
              ) : null}

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Card variant="soft" sx={{ p: 2.5, flex: 1 }}>
                  <Typography level="title-md">What you can do here</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      Compare game libraries with friends already around you.
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      Post a call to play when you want people now or later.
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      Use Discord-connected discovery instead of broadcasting to
                      everyone.
                    </Typography>
                  </Stack>
                </Card>

                <Card variant="soft" sx={{ p: 2.5, flex: 1 }}>
                  <Typography level="title-md">Invite context</Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      {details.inviterLabel
                        ? `Invited by ${details.inviterLabel}.`
                        : 'Opened from a Discord invite.'}
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      {details.serverName
                        ? `Shared through ${details.serverName}.`
                        : "Shared from a Game's Up Discord invite flow."}
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      {sessionLoading
                        ? 'Checking your current sign-in state...'
                        : isAuthenticated
                          ? 'You already have an active session on this browser.'
                          : 'You will sign in with Discord before entering the app.'}
                    </Typography>
                  </Stack>
                </Card>
              </Stack>
            </Stack>
          </Sheet>
        </Stack>
      </Box>
    </CssVarsProvider>
  )
}
