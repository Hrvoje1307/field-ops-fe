import { getDb } from '../../db'
import type { MailboxRow, MailMessageRow, MailThreadRow, SalesData } from '../../db/sales-rows'
import type { TenantData } from '../../db/rows'
import type { AuthContext } from '../auth'
import { featuresOf, hasSalesAccess } from '../present'
import { forbidden, notFound } from '../problems'

/** Plan feature `sales_ai`: classification, summaries, suggestions and drafts. */
export const hasAiFeature = (t: TenantData) => featuresOf(t).includes('sales_ai')

/** Whether the user may use Sales: the plan feature and (owner or the membership permission). */
export function salesAccessOf(auth: AuthContext): boolean {
  const membership = getDb().memberships.find(
    (m) => m.tenantId === auth.tenantId && m.userId === auth.user.id && m.isActive,
  )
  return hasSalesAccess(featuresOf(auth.t), membership)
}

/** Operations the spec marks "Owner only". */
const OWNER_ONLY_OPERATIONS = new Set([
  'POST /sales/mailboxes/oauth/start',
  'POST /sales/mailboxes/imap',
  'PUT /sales/mailboxes/{id}',
  'DELETE /sales/mailboxes/{id}',
  'PUT /sales/settings',
  'POST /sales/stages',
  'PUT /sales/stages/order',
  'PUT /sales/stages/{id}',
  'DELETE /sales/stages/{id}',
  'POST /sales/follow-up-rules',
  'PUT /sales/follow-up-rules/{id}',
  'DELETE /sales/follow-up-rules/{id}',
  'POST /sales/exclusions',
  'DELETE /sales/exclusions/{id}',
])

/**
 * Access is decided before the body is read, so a user without access gets 403 and not
 * 400 for an invalid body.
 */
export function salesPreflight(auth: AuthContext, method: string, template: string): void {
  salesContext(auth, {
    ownerOnly: OWNER_ONLY_OPERATIONS.has(`${method.toUpperCase()} ${template}`),
  })
}

/**
 * Every operation of the Sales tag: 403 `sales.not_enabled` when the plan lacks the
 * feature, 403 `sales.forbidden` when the user has no sales access. Operations marked
 * "Owner only" in the spec also need the owner role (generic `auth.forbidden`: the
 * spec names no code for it).
 */
export function salesContext(
  auth: AuthContext,
  { ownerOnly = false }: { ownerOnly?: boolean } = {},
): { t: TenantData; sales: SalesData } {
  if (!featuresOf(auth.t).includes('sales')) {
    throw forbidden('sales.not_enabled', 'The plan does not include the Sales module.')
  }
  if (!salesAccessOf(auth)) throw forbidden('sales.forbidden', 'No access to the Sales module.')
  if (ownerOnly && auth.role !== 'owner') throw forbidden()
  return { t: auth.t, sales: auth.t.sales }
}

/**
 * Shared mailboxes are visible to everyone with sales access; a personal mailbox only to
 * its owner and to tenant owners. A mailbox that was disconnected without `purge` keeps
 * its history under the same rule.
 */
export function canSeeMailbox(auth: AuthContext, mailbox: MailboxRow): boolean {
  return mailbox.kind === 'shared' || auth.role === 'owner' || mailbox.ownerUserId === auth.user.id
}

export function visibleMailboxIds(auth: AuthContext, sales: SalesData): Set<string> {
  return new Set(sales.mailboxes.filter((m) => canSeeMailbox(auth, m)).map((m) => m.id))
}

/** A message is visible when at least one of its mailboxes is. */
export const canSeeMessage = (message: MailMessageRow, visible: Set<string>) =>
  message.mailboxIds.some((id) => visible.has(id))

/** The messages of a thread the user can see, oldest first. */
export function visibleMessages(
  sales: SalesData,
  thread: MailThreadRow,
  visible: Set<string>,
): MailMessageRow[] {
  return sales.messages
    .filter((m) => m.threadId === thread.id && canSeeMessage(m, visible))
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
}

/** A thread the user can see (404 when not, also for someone else's personal inbox). */
export function getVisibleThread(auth: AuthContext, sales: SalesData, id: string): MailThreadRow {
  const thread = sales.threads.find((row) => row.id === id && !row.deletedAt)
  if (!thread) throw notFound()
  const visible = visibleMailboxIds(auth, sales)
  if (!thread.mailboxIds.some((mailboxId) => visible.has(mailboxId))) throw notFound()
  if (visibleMessages(sales, thread, visible).length === 0) throw notFound()
  return thread
}
