/**
 * A page's signed-out state: the shared empty state with a sign-in icon, followed by the
 * Discord sign-in card, which returns the visitor to the page they were on.
 */
import LoginRoundedIcon from '@mui/icons-material/LoginRounded'
import { Stack } from '@mui/joy'
import { EmptyState } from '../EmptyState'
import { DiscordSignInCard } from './DiscordSignInCard'

export function SignedOutEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const signInHref =
    typeof window === 'undefined'
      ? '/api/auth/discord/login'
      : `/api/auth/discord/login?returnTo=${encodeURIComponent(window.location.href)}`

  return (
    <Stack spacing={1.5}>
      <EmptyState
        icon={<LoginRoundedIcon />}
        title={title}
        description={description}
      />
      <DiscordSignInCard href={signInHref} />
    </Stack>
  )
}
