import '@testing-library/jest-dom/vitest'
import '@/shared/i18n'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '@/shared/api/mocks/node'

// jsdom has no ResizeObserver; Radix (checkbox, popper) measures elements with it
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  }
}

// jsdom has no matchMedia; a test that wants a phone screen stubs it (see `useIsMobile`)
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
