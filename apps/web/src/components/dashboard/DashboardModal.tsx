import type { ReactNode } from 'react'
import { Modal, ModalClose, ModalDialog } from '@mui/joy'

export function DashboardModal({
  open,
  onClose,
  width,
  children
}: {
  open: boolean;
  onClose: () => void;
  width: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        layout="center"
        sx={{
          p: 0,
          width,
          maxWidth: '96vw',
          border: 'none',
          backgroundColor: 'transparent',
          boxShadow: 'none'
        }}
      >
        <ModalClose />
        {children}
      </ModalDialog>
    </Modal>
  )
}