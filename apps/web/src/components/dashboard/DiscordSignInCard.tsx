/** The "Sign in with Discord" card shown under signed-out empty states and on the Network page. */
import { Button, Card, Stack } from '@mui/joy'

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
