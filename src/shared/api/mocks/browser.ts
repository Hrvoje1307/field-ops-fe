import { setupWorker } from 'msw/browser'

import { resetMockDb } from './db'
import { handlers } from './handlers'
import { dropConnections, realtimeHandlers } from './lib/realtime'

export const worker = setupWorker(...handlers, ...realtimeHandlers)

if (import.meta.env.DEV) {
  // Reseed from the console: window.__fieldopsResetMock()
  Object.assign(window, {
    // Cuts the live connection, as a restart of the server or the network would: window.__fieldopsDropHub(1500)
    // keeps the hub unreachable for 1.5 s
    __fieldopsDropHub: (outageMs = 0) => {
      dropConnections(outageMs)
    },
    __fieldopsResetMock: () => {
      resetMockDb()
      dropConnections()
      console.info(
        '[mock] Database reseeded: data, sessions, login locks and idempotency keys cleared.',
      )
    },
  })
}
