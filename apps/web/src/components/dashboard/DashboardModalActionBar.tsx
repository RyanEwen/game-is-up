import type { ReactNode } from 'react'
import { Sheet, Stack } from '@mui/joy'

export function DashboardModalActionBar({
  primaryAction,
  secondaryAction
}: {
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <Sheet
      variant="soft"
      sx={{
        mt: 1,
        p: 1.25,
        borderRadius: 'lg',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)'
      }}
    >
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
        {secondaryAction}
        {primaryAction}
      </Stack>
    </Sheet>
  )
}