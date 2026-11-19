/**
 * Component test for the public privacy policy: it renders without a session, names the contact
 * for deletion requests, and never lists the email address among what is collected.
 */
import assert from 'node:assert/strict'
import test, { after, afterEach, before } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'

let dom: JSDOM
let createElement: typeof import('react').createElement
let render: typeof import('@testing-library/react').render
let screen: typeof import('@testing-library/react').screen
let cleanup: typeof import('@testing-library/react').cleanup
let PrivacyPage: typeof import('./PrivacyPage').PrivacyPage

before(async () => {
  dom = installJsdomGlobals({ url: 'http://localhost/privacy' })
  createElement = (await import('react')).createElement
  const testingLibrary = await import('@testing-library/react')
  render = testingLibrary.render
  screen = testingLibrary.screen
  cleanup = testingLibrary.cleanup
  PrivacyPage = (await import('./PrivacyPage')).PrivacyPage
})

afterEach(() => {
  cleanup()
})

after(() => {
  dom.window.close()
})

test('the policy renders with its contact and without collecting the email address', () => {
  render(createElement(PrivacyPage))

  assert.ok(screen.getByRole('heading', { name: 'Privacy policy' }))
  const contactLinks = screen.getAllByRole('link', {
    name: 'contact@dynamic-solutions.ca',
  })
  assert.ok(
    contactLinks.length >= 2,
    'deletion and contact sections both link it',
  )
  assert.equal(
    contactLinks[0]!.getAttribute('href'),
    'mailto:contact@dynamic-solutions.ca',
  )
  assert.match(
    document.body.textContent ?? '',
    /We do not collect your email address/,
  )
  assert.equal(document.title, "Game's Up • Privacy")
})
