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
