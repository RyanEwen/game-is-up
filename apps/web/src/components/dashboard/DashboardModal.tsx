import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { Modal, ModalClose, ModalDialog } from '@mui/joy'

const dialogHistoryStackStateKey = '__gameIsUpDialogStack'

type ActiveDialogEntry = {
  token: string
  requestClose: () => void
}

let dialogHistoryTokenCounter = 0
let dialogHistoryListenerInstalled = false
const activeDialogEntries: ActiveDialogEntry[] = []
const dismissedDialogTokens = new Set<string>()
const closingDialogTokensFromHistory = new Set<string>()

function createDialogHistoryToken() {
  dialogHistoryTokenCounter += 1
  return `dialog-${dialogHistoryTokenCounter}`
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  )
}

function readDialogHistoryStack(state: unknown): string[] {
  if (state == null || typeof state !== 'object') {
    return []
  }

  const stack = (state as Record<string, unknown>)[dialogHistoryStackStateKey]
  return isStringArray(stack) ? stack : []
}

function buildDialogHistoryState(stack: string[]) {
  const currentState = window.history.state
  const baseState =
    currentState != null && typeof currentState === 'object'
      ? (currentState as Record<string, unknown>)
      : {}

  return {
    ...baseState,
    [dialogHistoryStackStateKey]: stack,
  }
}

function getActiveDialogStack() {
  return activeDialogEntries.map((entry) => entry.token)
}

function areDialogStacksEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  )
}

function isDialogStackPrefix(prefix: string[], full: string[]) {
  return (
    prefix.length <= full.length &&
    prefix.every((entry, index) => entry === full[index])
  )
}

function isTopHistoryDialog(token: string) {
  const stack = readDialogHistoryStack(window.history.state)
  return stack[stack.length - 1] === token
}

function replaceCurrentDialogHistoryWithActiveStack() {
  window.history.replaceState(
    buildDialogHistoryState(getActiveDialogStack()),
    document.title,
  )
}

function registerActiveDialog(token: string, requestClose: () => void) {
  const existingEntry = activeDialogEntries.find(
    (entry) => entry.token === token,
  )

  if (existingEntry) {
    existingEntry.requestClose = requestClose
    return false
  }

  activeDialogEntries.push({ token, requestClose })
  return true
}

function unregisterActiveDialog(token: string) {
  const entryIndex = activeDialogEntries.findIndex(
    (entry) => entry.token === token,
  )

  if (entryIndex === -1) {
    return false
  }

  activeDialogEntries.splice(entryIndex, 1)
  return true
}

function handleDialogHistoryPopState(event: PopStateEvent) {
  const nextStack = readDialogHistoryStack(event.state)
  const currentStack = getActiveDialogStack()

  if (areDialogStacksEqual(nextStack, currentStack)) {
    return
  }

  if (isDialogStackPrefix(nextStack, currentStack)) {
    const dialogsToClose = activeDialogEntries.slice(nextStack.length).reverse()

    dialogsToClose.forEach((entry) => {
      dismissedDialogTokens.add(entry.token)
      closingDialogTokensFromHistory.add(entry.token)
      entry.requestClose()
    })
    return
  }

  const isStaleDialogEntry =
    nextStack.some((token) => dismissedDialogTokens.has(token)) ||
    !isDialogStackPrefix(currentStack, nextStack)

  if (!isStaleDialogEntry) {
    return
  }

  queueMicrotask(() => {
    replaceCurrentDialogHistoryWithActiveStack()

    if (window.history.length > 1) {
      window.history.back()
    }
  })
}

function installDialogHistoryListener() {
  if (dialogHistoryListenerInstalled) {
    return
  }

  window.addEventListener('popstate', handleDialogHistoryPopState)
  dialogHistoryListenerInstalled = true
}

export function DashboardModal({
  open,
  onClose,
  width,
  children,
}: {
  open: boolean
  onClose: () => void
  width: string
  children: ReactNode
}) {
  const previousOpenRef = useRef(open)
  const onCloseRef = useRef(onClose)
  const dialogTokenRef = useRef<string | null>(null)

  onCloseRef.current = onClose

  const syncClosedDialog = useCallback(
    (token: string, closeViaHistory: boolean) => {
      const closedFromHistory = closingDialogTokensFromHistory.delete(token)

      dismissedDialogTokens.add(token)
      unregisterActiveDialog(token)
      dialogTokenRef.current = null

      if (
        !closedFromHistory &&
        closeViaHistory &&
        isTopHistoryDialog(token) &&
        window.history.length > 1
      ) {
        window.history.back()
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    installDialogHistoryListener()

    const dialogToken = dialogTokenRef.current ?? createDialogHistoryToken()
    dialogTokenRef.current = dialogToken

    const didRegister = registerActiveDialog(dialogToken, () =>
      onCloseRef.current(),
    )

    if (didRegister) {
      window.history.pushState(
        buildDialogHistoryState(getActiveDialogStack()),
        document.title,
      )
    }
  }, [open])

  useEffect(() => {
    const wasOpen = previousOpenRef.current
    previousOpenRef.current = open

    if (open || !wasOpen) {
      return
    }

    const dialogToken = dialogTokenRef.current

    if (dialogToken) {
      syncClosedDialog(dialogToken, true)
    }
  }, [open, syncClosedDialog])

  useEffect(() => {
    return () => {
      const dialogToken = dialogTokenRef.current

      if (!dialogToken) {
        return
      }

      closingDialogTokensFromHistory.delete(dialogToken)
      dismissedDialogTokens.add(dialogToken)
      unregisterActiveDialog(dialogToken)
      dialogTokenRef.current = null
    }
  }, [])

  const handleClose = useCallback(() => {
    const dialogToken = dialogTokenRef.current

    if (!dialogToken) {
      onCloseRef.current()
      return
    }

    dismissedDialogTokens.add(dialogToken)

    if (isTopHistoryDialog(dialogToken) && window.history.length > 1) {
      window.history.back()
      return
    }

    onCloseRef.current()
  }, [])

  return (
    <Modal open={open} onClose={handleClose} sx={{ p: { xs: 1, sm: 2 } }}>
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
    </Modal>
  )
}
