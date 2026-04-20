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
    <Modal open={open} onClose={onClose} sx={{ p: { xs: 1, sm: 2 } }}>
      <ModalDialog
        layout="center"
        sx={{
          width,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 16px)',
          overflow: 'hidden',
          backgroundColor: '#0f1726',
          borderColor: '#304159',
          boxShadow: 'none'
        }}
      >
        <ModalClose sx={{ zIndex: 1 }} />
        {children}
      </ModalDialog>
    </Modal>
  )
}