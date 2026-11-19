/**
 * The app's one empty-state surface (UI-13): an icon, a short title saying what is missing,
 * one line on why or what to do, and an optional action. Every list or page that can have
 * nothing to show uses it. Named and shaped after printstream's `EmptyState`, styled with
 * this app's dashed card.
 */
import type { ReactNode } from 'react'
import { Box, Card, Stack, Typography } from '@mui/joy'
import { dashedTopLevelCardSx } from './dashboard/dashboardUtils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  /** A rounded MUI icon that names the missing thing. */
  icon: ReactNode
  title: ReactNode
  description: ReactNode
  action?: ReactNode
  /** Tighter spacing, for an empty state inside a card or a short list. */
  compact?: boolean
}) {
  return (
    <Card variant="soft" sx={{ p: compact ? 2 : 3, ...dashedTopLevelCardSx }}>
      <Stack spacing={compact ? 1 : 1.5} sx={{ alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={{
            width: compact ? 40 : 48,
            height: compact ? 40 : 48,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.300',
            backgroundColor:
              'rgba(var(--joy-palette-primary-mainChannel) / 0.12)',
            border:
              '1px solid rgba(var(--joy-palette-primary-mainChannel) / 0.28)',
          }}
        >
          {icon}
        </Box>
        <Typography level={compact ? 'title-md' : 'title-lg'}>
          {title}
        </Typography>
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          {description}
        </Typography>
        {action ?? null}
      </Stack>
    </Card>
  )
}
