/**
 * Unit tests for the shared clock behind useNow: one timer however many subscribers, a tick every
 * interval, a pause while the tab is hidden and an immediate catch-up when it is shown again.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNowStore } from './useNow'

/** A fake environment: a settable clock, manual timers and a toggleable visibility. */
function fakeEnvironment() {
  let time = 1_000
  const timers = new Map<number, () => void>()
  let nextHandle = 1
  const visibilityListeners: (() => void)[] = []
  const page = { hidden: false }

  return {
    page,
    timers,
    advance(ms: number) {
      time += ms
    },
    fireTimers() {
      for (const callback of timers.values()) {
        callback()
      }
    },
    setHidden(hidden: boolean) {
      page.hidden = hidden
      for (const listener of visibilityListeners) {
        listener()
      }
    },
    environment: {
      readNow: () => time,
      setInterval: (callback: () => void) => {
        const handle = nextHandle++
        timers.set(handle, callback)
        return handle
      },
      clearInterval: (handle: unknown) => {
        timers.delete(handle as number)
      },
      document: {
        get hidden() {
          return page.hidden
        },
        addEventListener: (_type: string, listener: () => void) => {
          visibilityListeners.push(listener)
        },
        removeEventListener: () => {},
      } as unknown as Pick<
        Document,
        'hidden' | 'addEventListener' | 'removeEventListener'
      >,
    },
  }
}

test('one timer serves every subscriber, and each tick notifies them all', () => {
  const fake = fakeEnvironment()
  const store = createNowStore(fake.environment, 30_000)
  let notified = 0

  store.subscribe(() => (notified += 1))
  store.subscribe(() => (notified += 1))
  assert.equal(fake.timers.size, 1)
  assert.equal(store.getSnapshot(), 1_000)

  fake.advance(30_000)
  fake.fireTimers()
  assert.equal(store.getSnapshot(), 31_000)
  assert.equal(notified, 2)
})

test('the snapshot is stable between ticks', () => {
  const fake = fakeEnvironment()
  const store = createNowStore(fake.environment, 30_000)
  store.subscribe(() => {})

  fake.advance(5_000)
  assert.equal(store.getSnapshot(), 1_000)
  assert.equal(store.getSnapshot(), store.getSnapshot())
})

test('a hidden tab stops the clock, and showing it catches up at once', () => {
  const fake = fakeEnvironment()
  const store = createNowStore(fake.environment, 30_000)
  let notified = 0
  store.subscribe(() => (notified += 1))

  fake.setHidden(true)
  assert.equal(fake.timers.size, 0, 'no timer while hidden')

  fake.advance(120_000)
  fake.setHidden(false)
  assert.equal(store.getSnapshot(), 121_000, 'caught up on return')
  assert.equal(notified, 1)
  assert.equal(fake.timers.size, 1, 'ticking again')
})

test('a clock first used while hidden starts ticking only once shown', () => {
  const fake = fakeEnvironment()
  fake.page.hidden = true
  const store = createNowStore(fake.environment, 30_000)
  store.subscribe(() => {})
  assert.equal(fake.timers.size, 0)

  fake.setHidden(false)
  assert.equal(fake.timers.size, 1)
})
