import { setupWorker } from 'msw/browser'

import { resetMockDb } from './db'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

if (import.meta.env.DEV) {
  // Reseed from the console: window.__fieldopsResetMock()
  Object.assign(window, {
    __fieldopsResetMock: () => {
      resetMockDb()
      console.info(
        '[mock] Database reseeded: data, sessions, login locks and idempotency keys cleared.',
      )
    },
  })
}
