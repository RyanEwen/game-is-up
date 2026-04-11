import type { ReactNode } from 'react'
import { DialogActions } from '@mui/joy'

export function DashboardModalActionBar({
  primaryAction,
  secondaryAction
}: {
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <DialogActions
      orientation="horizontal"
      sx={{
        mt: 1,
        p: 0,
        gap: 1,
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        width: '100%'
      }}
    >
      {primaryAction}
      {secondaryAction}
    </DialogActions>
  )
}