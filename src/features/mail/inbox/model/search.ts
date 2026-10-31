import { z } from 'zod'

import { INBOX_CARDS, type InboxCard, cardParams } from '@/entities/mail-thread'
import type { ListMailThreadsParams } from '@/shared/api/generated/model'

export const INBOX_PAGE_SIZE = 30

/** The inbox's URL search params; the open conversation is part of the address. */
export const inboxSearchSchema = z.object({
  card: z.enum(INBOX_CARDS).default('sales').catch('sales'),
  mailbox: z.string().optional().catch(undefined),
  q: z.string().max(200).optional().catch(undefined),
  page: z.number().int().min(1).default(1).catch(1),
  thread: z.string().optional().catch(undefined),
})

export type InboxSearch = z.infer<typeof inboxSearchSchema>
export type InboxSearchChange = (
  patch: Partial<InboxSearch>,
  options?: { replace?: boolean },
) => void

/** Left out of the address when they have these values. */
export const INBOX_SEARCH_DEFAULTS = {
  card: 'sales',
  page: 1,
} as const satisfies Partial<InboxSearch>

export function hasInboxFilters(search: InboxSearch): boolean {
  return Boolean(search.q?.trim()) || Boolean(search.mailbox)
}

/** `GET /sales/threads` params: the card's own parameters, the mailbox, the search, the page. */
export function toListThreadsParams(
  search: InboxSearch,
  card: InboxCard = search.card,
): ListMailThreadsParams {
  const q = search.q?.trim()
  return {
    ...cardParams(card),
    ...(search.mailbox ? { mailboxId: search.mailbox } : {}),
    ...(q ? { q } : {}),
    sort: '-lastMessageAt',
    page: search.page,
    pageSize: INBOX_PAGE_SIZE,
  }
}
