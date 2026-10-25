import { describe, expect, it } from 'vitest'

import { messagesSearchSchema, PAGE_SIZE, toListMessagesParams } from './search'

describe('messages search', () => {
  it('falls back to all messages on the first page when the address is wrong', () => {
    expect(messagesSearchSchema.parse({})).toEqual({ status: 'all', page: 1 })
    expect(messagesSearchSchema.parse({ status: 'gone', page: -3 })).toEqual({
      status: 'all',
      page: 1,
    })
    expect(messagesSearchSchema.parse({ status: 'failed', page: 2 })).toEqual({
      status: 'failed',
      page: 2,
    })
  })

  it('asks for a page, and for a status only when one is chosen', () => {
    expect(toListMessagesParams({ status: 'all', page: 3 })).toEqual({
      page: 3,
      pageSize: PAGE_SIZE,
    })
    expect(toListMessagesParams({ status: 'failed', page: 1 })).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
      status: 'failed',
    })
  })
})
