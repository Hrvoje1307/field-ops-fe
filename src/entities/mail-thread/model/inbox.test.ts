import { describe, expect, it } from 'vitest'

import { cardParams, cardsFor, INBOX_CARDS, isSalesCategory } from './inbox'

describe('inbox cards', () => {
  it('are parameters of the API and nothing else', () => {
    expect(cardParams('sales')).toEqual({ isSales: true })
    expect(cardParams('review')).toEqual({ needsReview: true })
    expect(cardParams('awaiting')).toEqual({ awaitingReply: true })
    expect(cardParams('unlinked')).toEqual({ unlinked: true })
    expect(cardParams('all')).toEqual({})
    expect(cardParams('other')).toEqual({ isSales: false })
    expect(INBOX_CARDS).toHaveLength(6)
  })
  it('without the AI there is no review card and no card of what the AI set aside', () => {
    expect(cardsFor(false)).toEqual(['sales', 'awaiting', 'unlinked', 'all'])
    expect(cardsFor(true)).toEqual([...INBOX_CARDS])
  })
  it('knows the sales categories of the contract', () => {
    expect(isSalesCategory('negotiation')).toBe(true)
    expect(isSalesCategory('declined')).toBe(true)
    for (const category of ['support', 'admin', 'spam', 'other'] as const) {
      expect(isSalesCategory(category)).toBe(false)
    }
  })
})
