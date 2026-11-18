import type { ReactNode } from 'react'
import { Box, DialogActions } from '@mui/joy'

export function DashboardModalActionBar({
  primaryAction,
  secondaryAction,
  cancelAction,
}: {
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  cancelAction?: ReactNode
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
        width: '100%',
      }}
    >
      {secondaryAction}
      {primaryAction}
      {cancelAction ? (
        <Box
          sx={{
            ml: 'auto',
            display: 'flex',
            alignSelf: 'stretch',
            '& > *': {
              height: '100%',
            },
          }}
        >
          {cancelAction}
        </Box>
      ) : null}
    </DialogActions>
  )
}
