/**
 * Confirmation for an action the user should not take by accident, in place of the
 * browser's native `confirm` (UI-9). Named after printstream's dialog of the same job.
 *
 * Built on the dashboard dialog, so Back and Escape cancel it. The confirm button names the
 * action and is never the default: it is not a submit button and does not take focus, so
 * Enter or a stray click on the scrim cannot confirm. While the action runs, both buttons
 * and the close control stay put and the dialog cannot be dismissed.
 */
import type { ReactNode } from 'react'
import { Button, DialogContent, DialogTitle, Stack, Typography } from '@mui/joy'
import type { ColorPaletteProp } from '@mui/joy'
import { DashboardModal } from './DashboardModal'
import { DashboardModalActionBar } from './DashboardModalActionBar'

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  color = 'danger',
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: ReactNode
  description: ReactNode
  /** The action itself, such as "Delete call to play"; never a bare "OK". */
  confirmLabel: string
  cancelLabel?: string
  color?: ColorPaletteProp
  /** The action is running: the dialog cannot be dismissed and Confirm shows progress. */
  pending?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  /** Ignore dismissal while the action runs, so its outcome is never hidden. */
  function requestClose() {
    if (!pending) {
      onClose()
    }
  }

  return (
    <DashboardModal open={open} onClose={requestClose} width="440px">
      <Stack spacing={2}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {typeof description === 'string' ? (
            <Typography level="body-sm">{description}</Typography>
          ) : (
            description
          )}
        </DialogContent>
        <DashboardModalActionBar
          primaryAction={
            <Button color={color} loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          }
          cancelAction={
            <Button
              variant="plain"
              color="neutral"
              disabled={pending}
              onClick={requestClose}
            >
              {cancelLabel}
            </Button>
          }
        />
      </Stack>
    </DashboardModal>
  )
}
