import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'
import type { HubEvent } from '@/shared/api/realtime/hub'

import { REFRESH_COALESCE_MS } from '../const'

export interface SalesRefresher {
  /** A sales event of the hub: what shows the thread, deal or draft it names is marked stale. */
  handle: (event: HubEvent) => void
  /** The connection came back after a break: events were missed, so all sales data is stale. */
  all: () => void
  dispose: () => void
}

interface Pending {
  threads: Set<string>
  deals: Set<string>
  drafts: Set<string>
  mailboxes: boolean
}

const empty = (): Pending => ({
  threads: new Set(),
  deals: new Set(),
  drafts: new Set(),
  mailboxes: false,
})

/**
 * Keys are `[area, kind, id?, …]` (see `dealKeys`, `mailThreadKeys`, `draftKeys`). A thread,
 * deal or draft that is named refreshes its own detail; the lists it can appear in (inbox,
 * funnel, Today, drafts) are refreshed whatever their filters, because the event does not
 * say which ones. Mailboxes are refreshed by a thread event: a sync that brings mail is
 * how a mailbox's status and last sync change, and no event of its own announces them.
 */
function matches(key: QueryKey, pending: Pending): boolean {
  const [area, kind, id] = key
  const named = (ids: Set<string>) => typeof id === 'string' && ids.has(id)
  switch (area) {
    case 'mail-threads':
      return kind === 'list' ? true : named(pending.threads)
    case 'deals':
      // The funnel, the lists and Today show any deal; a detail (and its timeline) only its own
      return kind === 'detail' ? named(pending.deals) : true
    case 'drafts':
      return kind === 'list' ? true : named(pending.drafts)
    case 'mailboxes':
      return pending.mailboxes
    default:
      return false
  }
}

/**
 * Marks sales data stale when the hub announces a change (`SalesThreadUpdated`,
 * `DealUpdated`, `DraftReady`), by the ids in the event; what is on screen refetches. A
 * burst of events refreshes once.
 */
export function createSalesRefresher(
  queryClient: QueryClient,
  delay: number = REFRESH_COALESCE_MS,
): SalesRefresher {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = empty()

  const flush = () => {
    const batch = pending
    pending = empty()
    timer = undefined
    void queryClient.invalidateQueries({ predicate: (query) => matches(query.queryKey, batch) })
  }
  const schedule = () => {
    timer ??= setTimeout(flush, delay)
  }

  return {
    handle: (event) => {
      switch (event.type) {
        case 'SalesThreadUpdated':
          pending.threads.add(event.payload.threadId)
          if (event.payload.dealId) pending.deals.add(event.payload.dealId)
          pending.mailboxes = true
          break
        case 'DealUpdated':
          pending.deals.add(event.payload.dealId)
          break
        case 'DraftReady':
          pending.drafts.add(event.payload.draftId)
          pending.threads.add(event.payload.threadId)
          break
        default:
          return
      }
      schedule()
    },
    all: () => {
      void invalidateRoots(queryClient, SALES_DATA_ROOTS)
    },
    dispose: () => {
      clearTimeout(timer)
      timer = undefined
    },
  }
}
