import { describe, expect, it } from 'vitest'

import { inboxSearchSchema, toListThreadsParams } from './search'

const parse = (value: unknown) => inboxSearchSchema.parse(value)

describe('inbox search', () => {
  it('starts on Prodaja, page 1; bad values fall back', () => {
    expect(parse({})).toMatchObject({ card: 'sales', page: 1 })
    expect(parse({ card: 'nope', page: -3 })).toMatchObject({ card: 'sales', page: 1 })
  })
  it('turns each card into its API parameters, adding mailbox, search and page', () => {
    const base = { page: 2, mailbox: 'mb', q: ' nadzor ' }
    expect(toListThreadsParams(parse({ ...base, card: 'review' }))).toMatchObject({
      needsReview: true,
      mailboxId: 'mb',
      q: 'nadzor',
      page: 2,
    })
    expect(toListThreadsParams(parse({ card: 'awaiting' }))).toMatchObject({ awaitingReply: true })
    expect(toListThreadsParams(parse({ card: 'other' }))).toMatchObject({ isSales: false })
    expect(toListThreadsParams(parse({ card: 'all' }))).not.toHaveProperty('isSales')
  })
})
