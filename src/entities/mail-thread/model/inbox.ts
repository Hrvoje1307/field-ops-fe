import type { ListMailThreadsParams, ThreadCategory } from '@/shared/api/generated/model'

/** The inbox's cards. Each is a set of API parameters and nothing else. */
export const INBOX_CARDS = ['sales', 'review', 'awaiting', 'unlinked', 'all', 'other'] as const
export type InboxCard = (typeof INBOX_CARDS)[number]

/** Cards that exist because of the AI (a threshold, a classification): hidden without `sales_ai`. */
export const AI_CARDS: readonly InboxCard[] = ['review', 'other']

export function cardParams(
  card: InboxCard,
): Pick<ListMailThreadsParams, 'isSales' | 'needsReview' | 'awaitingReply' | 'unlinked'> {
  switch (card) {
    case 'sales':
      return { isSales: true }
    case 'review':
      return { needsReview: true }
    case 'awaiting':
      return { awaitingReply: true }
    case 'unlinked':
      return { unlinked: true }
    case 'other':
      // Non-sales conversations are returned only when asked for
      return { isSales: false }
    case 'all':
      return {}
  }
}

export function cardsFor(hasAi: boolean): InboxCard[] {
  return INBOX_CARDS.filter((card) => hasAi || !AI_CARDS.includes(card))
}

/** The contract's platform categories, sales ones first (labels come from i18n). */
export const SALES_CATEGORIES = [
  'new_inquiry',
  'quote_request',
  'follow_up',
  'negotiation',
  'objection',
  'accepted',
  'declined',
] as const satisfies readonly ThreadCategory[]
export const OTHER_CATEGORIES = [
  'support',
  'admin',
  'spam',
  'other',
] as const satisfies readonly ThreadCategory[]
export const ALL_CATEGORIES: readonly ThreadCategory[] = [...SALES_CATEGORIES, ...OTHER_CATEGORIES]

/** Sales categories are `new_inquiry … declined` (the contract's description of `ThreadCategory`). */
export function isSalesCategory(category: ThreadCategory): boolean {
  return (SALES_CATEGORIES as readonly string[]).includes(category)
}
