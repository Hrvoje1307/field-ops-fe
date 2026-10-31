import { toIsoInstant } from '@/shared/lib/datetime'

import type { MailboxRow } from '../../db/sales-rows'

/** Mailboxes whose first sync is over become `active`. True when something changed. */
export function settleMailboxes(mailboxes: MailboxRow[], now = Date.now()): boolean {
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
