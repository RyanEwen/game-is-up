/**
 * Component test for the dashboard's dialog frame: its close button is reachable by name, which
 * every dashboard dialog inherits, and pressing it closes the dialog.
 */
import assert from 'node:assert/strict'
import test, { after, afterEach, before } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../../test-utils/jsdom'

let dom: JSDOM
let createElement: typeof import('react').createElement
let render: typeof import('@testing-library/react').render
let screen: typeof import('@testing-library/react').screen
let fireEvent: typeof import('@testing-library/react').fireEvent
let cleanup: typeof import('@testing-library/react').cleanup
let DashboardModal: typeof import('./DashboardModal').DashboardModal

before(async () => {
  dom = installJsdomGlobals()
  createElement = (await import('react')).createElement
  const testingLibrary = await import('@testing-library/react')
  render = testingLibrary.render
  screen = testingLibrary.screen
  fireEvent = testingLibrary.fireEvent
  cleanup = testingLibrary.cleanup
  DashboardModal = (await import('./DashboardModal')).DashboardModal
})

afterEach(() => {
  cleanup()
})

after(() => {
  dom.window.close()
})

test('the close button has an accessible name and closes the dialog', () => {
  let closes = 0
  render(
    createElement(DashboardModal, {
      open: true,
      width: '480px',
      onClose: () => {
        closes += 1
      },
      children: 'Dialog body',
    }),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  assert.equal(closes, 1)
})
