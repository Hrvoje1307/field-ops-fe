import { saveDb } from '../../db'
import type { AuthContext } from '../auth'
import { salesContext } from './access'
import { settleDue } from './ai'
import { scheduleMailboxSettle, settleMailboxes } from './mailboxes'

/** The guard of every Sales operation, after finishing what was due (classifications, drafts). */
export function openSales(auth: AuthContext, options?: { ownerOnly?: boolean }) {
  const context = salesContext(auth, options)
  // What finished is stored, so a reload (or another tab) does not finish it a second time
  const settled = settleDue(auth.tenantId, context.t)
  if (settleMailboxes(context.t.sales.mailboxes) || settled) saveDb()
  scheduleMailboxSettle(auth.tenantId, context.t.sales.mailboxes)
  return context
}
