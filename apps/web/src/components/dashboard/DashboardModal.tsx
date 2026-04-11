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
          backgroundColor: 'rgba(11, 16, 32, 0.84)',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.42)',
          backdropFilter: 'blur(18px)'
        }}
      >
        <ModalClose sx={{ zIndex: 1 }} />
        {children}
      </ModalDialog>
    </Modal>
  )
}