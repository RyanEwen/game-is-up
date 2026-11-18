/**
 * The dashboard's dialog frame: a centred, theme-styled `ModalDialog` with a close button,
 * mounted on `BackAwareModal` so browser and Android Back close the top dialog instead of
 * navigating away (UI-9). Every dashboard dialog uses this; none mounts Joy's `Modal` directly.
 *
 * Dismissal follows `BackAwareModal`: the X, Escape and Back close the dialog, and a click on
 * the scrim does not.
 */
import type { ReactNode } from 'react'
import { ModalClose, ModalDialog } from '@mui/joy'
import { BackAwareModal } from '../BackAwareModal'

export function DashboardModal({
  open,
  onClose,
  width,
  children,
}: {
  open: boolean
  onClose: () => void
  /** CSS width of the dialog; it is capped at the viewport width. */
  width: string
  children: ReactNode
}) {
  return (
    <BackAwareModal
      open={open}
      onClose={() => onClose()}
      sx={{ p: { xs: 1, sm: 2 } }}
    >
      <ModalDialog
        layout="center"
        sx={{
          width,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 16px)',
          overflow: 'hidden',
          backgroundColor: 'var(--gu-modal-dialog-background)',
          borderColor: 'var(--gu-modal-dialog-border)',
          boxShadow: 'none',
        }}
      >
        <ModalClose sx={{ zIndex: 1 }} />
        {children}
      </ModalDialog>
    </BackAwareModal>
  )
}
