/** An open dialog holds the app busy, so an update reload waits until it closes. */
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'

let dom: JSDOM

before(() => {
  // jsdom before Joy: its popup machinery detects the DOM at import time.
  dom = installJsdomGlobals()
})

after(() => {
  dom.window.close()
})

/** Poll for an outcome; the kit updates its stack a task after a dialog opens. */
async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('the app is busy exactly while a dialog is open', async () => {
  const { createElement } = await import('react')
  const { render, cleanup } = await import('@testing-library/react')
  const { BackAwareModal } =
    await import('@dynamic-solutions-canada/web-app-kit')
  const appBusy = await import('./appBusy')
  const { trackDialogsAsAppBusy } = await import('./appBusyDialogs')

  appBusy.resetAppBusyForTests()
  const stop = trackDialogsAsAppBusy()
  assert.equal(appBusy.isAppBusy(), false)

  // Children go in the props object: Joy's `Modal` types `children` as required.
  render(
    createElement(BackAwareModal, {
      open: true,
      children: createElement('div', null, 'dialog body'),
    }),
  )
  await waitUntil(() => appBusy.isAppBusy())
  assert.equal(appBusy.isAppBusy(), true, 'an open dialog must block a reload')

  cleanup()
  await waitUntil(() => !appBusy.isAppBusy())
  assert.equal(appBusy.isAppBusy(), false, 'closing it must release the hold')
  stop()
})
