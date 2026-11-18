/** Collects an optional delay estimate while preserving the current response until save succeeds. */
import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  ButtonGroup,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
} from '@mui/joy'
import { parseRunningLateMinutes } from '@game-is-up/shared'
import { DashboardModal } from './DashboardModal'
import { DashboardModalActionBar } from './DashboardModalActionBar'

/** Uses the standard dashboard dialog and footer for both initial and revised estimates. */
export function RunningLateDialog({
  open,
  minutes,
  pending,
  onClose,
  onSave,
}: {
  open: boolean
  minutes?: number | null
  pending: boolean
  onClose: () => void
  onSave: (minutes: number | null) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(minutes == null ? '' : String(minutes))
      setSaveFailed(false)
    }
  }, [open, minutes])

  const estimate = parseRunningLateMinutes(value)

  /** Leaves the form open on failure so the user can retry their original estimate. */
  async function saveEstimate() {
    if (!estimate.success || pending) {
      return
    }

    setSaveFailed(false)
    if (await onSave(estimate.data)) {
      onClose()
    } else {
      setSaveFailed(true)
    }
  }

  return (
    <DashboardModal open={open} onClose={onClose} width="420px">
      <Stack
        component="form"
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault()
          void saveEstimate()
        }}
      >
        <DialogTitle>I&apos;ll be late</DialogTitle>
        <FormControl error={!estimate.success}>
          <FormLabel>How many minutes late?</FormLabel>
          <Input
            autoFocus
            type="number"
            value={value}
            disabled={pending}
            onChange={(event) => setValue(event.target.value)}
            endDecorator="minutes"
            slotProps={{
              input: { min: 1, max: 1440, step: 1, inputMode: 'numeric' },
            }}
          />
          <FormHelperText>
            {estimate.success
              ? 'Leave blank if you are not sure yet.'
              : 'Enter a whole number between 1 and 1440.'}
          </FormHelperText>
        </FormControl>
        <ButtonGroup
          variant="outlined"
          disabled={pending}
          sx={{ flexWrap: 'wrap' }}
        >
          {[5, 15, 30, 60].map((preset) => (
            <Button
              key={preset}
              aria-pressed={value === String(preset)}
              onClick={() => setValue(String(preset))}
            >
              {preset} min
            </Button>
          ))}
          <Button onClick={() => setValue('')}>Not sure</Button>
        </ButtonGroup>
        {saveFailed ? (
          <Alert color="danger">
            Unable to save your delay. Please try again.
          </Alert>
        ) : null}
        <DashboardModalActionBar
          primaryAction={
            <Button
              type="submit"
              color="warning"
              loading={pending}
              disabled={!estimate.success}
            >
              Save response
            </Button>
          }
          cancelAction={
            <Button variant="plain" color="neutral" onClick={onClose}>
              Cancel
            </Button>
          }
        />
      </Stack>
    </DashboardModal>
  )
}
