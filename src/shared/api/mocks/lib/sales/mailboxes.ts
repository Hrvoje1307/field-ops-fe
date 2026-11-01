import { toIsoInstant } from '@/shared/lib/datetime'

import { getDb, saveDb } from '../../db'
import type { MailboxRow } from '../../db/sales-rows'
import { emitSales } from './events'

const HOLD_KEY = 'fieldops.mock.hold-connecting'

/** An e2e test keeps new mailboxes connecting (kept in the browser, which a redirect to the provider leaves). */
function isHeld(): boolean {
  try {
    return globalThis.localStorage.getItem(HOLD_KEY) === '1'
  } catch {
    return false
  }
}

/** Mailboxes whose first sync is over become `active`. True when something changed. */
export function settleMailboxes(mailboxes: MailboxRow[], now = Date.now()): boolean {
  if (isHeld()) return false
  let changed = false
  for (const row of mailboxes) {
    if (row.status !== 'connecting' || !row.connectingUntil) continue
    if (Date.parse(row.connectingUntil) > now) continue
    row.status = 'active'
    row.connectingUntil = null
    row.lastSyncedAt = toIsoInstant(now)
    changed = true
  }
  return changed
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * In the browser the first sync of a new mailbox ends by itself: the mailbox becomes active
 * and the hub tells the tenant about the mail it brought (`SalesThreadUpdated`, the one
 * event the contract has for it), so an open list refreshes without polling. It is armed
 * whenever Sales is opened with a mailbox still connecting (the page that created it may
 * have been left for the provider's consent page). Tests call `settleMailboxes` with a
 * clock of their own.
 */
export function scheduleMailboxSettle(tenantId: string, mailboxes: MailboxRow[]): void {
  if (import.meta.env.MODE === 'test' || timers.has(tenantId) || isHeld()) return
  const due = mailboxes
    .filter((m) => m.status === 'connecting' && m.connectingUntil)
    .map((m) => Date.parse(m.connectingUntil ?? ''))
  if (due.length === 0) return
  const wait = Math.max(0, Math.min(...due) - Date.now()) + 50
  timers.set(
    tenantId,
    setTimeout(() => {
      timers.delete(tenantId)
      const t = getDb().tenants[tenantId]
      if (!t) return
      if (settleMailboxes(t.sales.mailboxes)) {
        saveDb()
        const thread = t.sales.threads.find((x) => !x.deletedAt)
        if (thread) {
          emitSales(tenantId, {
            target: 'SalesThreadUpdated',
            payload: { threadId: thread.id, dealId: thread.dealId },
          })
        }
      }
      scheduleMailboxSettle(tenantId, t.sales.mailboxes)
    }, wait),
  )
}

/**
 * Test hook (`window.__fieldopsHoldMailboxes`): while held, a new mailbox stays `connecting`;
 * releasing it ends every first sync at once and announces it like the timer does.
 */
export function holdMailboxes(hold: boolean): void {
  try {
    if (hold) globalThis.localStorage.setItem(HOLD_KEY, '1')
    else globalThis.localStorage.removeItem(HOLD_KEY)
  } catch {
    return
  }
  if (hold) return
  for (const [tenantId, t] of Object.entries(getDb().tenants)) {
    const now = Date.now()
    for (const row of t.sales.mailboxes) {
      if (row.status === 'connecting') row.connectingUntil = toIsoInstant(now)
    }
    if (!settleMailboxes(t.sales.mailboxes, now)) continue
    saveDb()
    const thread = t.sales.threads.find((x) => !x.deletedAt)
    if (thread) {
      emitSales(tenantId, {
        target: 'SalesThreadUpdated',
        payload: { threadId: thread.id, dealId: thread.dealId },
      })
    }
  }
}
