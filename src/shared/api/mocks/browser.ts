import { setupWorker } from 'msw/browser'

import { getDb, resetMockDb, saveDb } from './db'
import { handlers } from './handlers'
import { dropConnections, realtimeHandlers } from './lib/realtime'
import { holdMailboxes } from './lib/sales/mailboxes'

export const worker = setupWorker(...handlers, ...realtimeHandlers)

if (import.meta.env.DEV) {
  // Reseed from the console: window.__fieldopsResetMock()
  Object.assign(window, {
    // Cuts the live connection, as a restart of the server or the network would: window.__fieldopsDropHub(1500)
    // keeps the hub unreachable for 1.5 s
    __fieldopsDropHub: (outageMs = 0) => {
      dropConnections(outageMs)
    },
    // The provider revokes a mailbox's grant, as it does in real life: window.__fieldopsExpireMailbox('info@firma.test')
    __fieldopsExpireMailbox: (address: string) => {
      for (const tenant of Object.values(getDb().tenants)) {
        for (const mailbox of tenant.sales.mailboxes) {
          if (mailbox.emailAddress !== address || mailbox.deletedAt) continue
          mailbox.status = 'needs_reauth'
          mailbox.lastError = 'Pristup je opozvan kod davatelja.'
        }
      }
      saveDb()
    },
    // Keeps new mailboxes connecting until released: window.__fieldopsHoldMailboxes(true / false)
    __fieldopsHoldMailboxes: (hold: boolean) => {
      holdMailboxes(hold)
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
