import { Button, Card, Chip, Stack, Typography } from '@mui/joy'
import { dashedTopLevelCardSx } from './dashboardUtils'

export function EmptyStateCard({
  title,
  body,
  chips,
  showSignInCard = false,
}: {
  title: string
  body: string
  chips?: string[]
  showSignInCard?: boolean
}) {
  const signInHref =
    typeof window === 'undefined'
      ? '/api/auth/discord/login'
      : `/api/auth/discord/login?returnTo=${encodeURIComponent(window.location.href)}`

  return (
    <Stack spacing={1.5}>
      <Card
        variant="soft"
        sx={{
          p: 3,
          ...dashedTopLevelCardSx,
        }}
      >
        <Stack spacing={1.5}>
          <Typography level="title-lg">{title}</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            {body}
          </Typography>
          {chips && chips.length > 0 ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {chips.map((chip) => (
                <Chip key={chip} variant="outlined" color="neutral">
                  {chip}
                </Chip>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Card>
      {showSignInCard ? <DiscordSignInCard href={signInHref} /> : null}
    </Stack>
  )
}

export function DiscordSignInCard({
  href,
  disabled = false,
  onClick,
}: {
  href?: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Button
          component={href ? 'a' : 'button'}
          href={href}
          disabled={disabled}
          onClick={onClick}
          color="primary"
          sx={{ alignSelf: 'stretch' }}
        >
          Sign in with Discord
        </Button>
      </Stack>
    </Card>
  )
}
