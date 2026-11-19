/** An in-flight TanStack Query mutation holds the app busy, so an update reload waits for it. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { MutationObserver } from '@tanstack/react-query'
import { isAppBusy, resetAppBusyForTests } from './appBusy'
import { trackMutationsAsAppBusy } from './appBusyMutations'
import { createAppQueryClient } from './queryClient'

test('the app is busy exactly while a mutation is in flight', async () => {
  resetAppBusyForTests()
  const client = createAppQueryClient()
  const stop = trackMutationsAsAppBusy(client)
  let finish: () => void = () => {}
  const observer = new MutationObserver(client, {
    mutationFn: () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  })

  assert.equal(isAppBusy(), false)
  const running = observer.mutate()
  await Promise.resolve()
  assert.equal(
    isAppBusy(),
    true,
    'a pending write must hold off an update reload',
  )
  finish()
  await running
  assert.equal(isAppBusy(), false, 'finishing the write releases the hold')
  stop()
})
