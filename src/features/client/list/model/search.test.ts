import { describe, expect, it } from 'vitest'

import { clientsSearchSchema, hasActiveFilters, PAGE_SIZE, toListClientsParams } from './search'

describe('clients search', () => {
  it('defaults to all clients by name, page 1; bad values fall back', () => {
    expect(clientsSearchSchema.parse({})).toEqual({ type: 'all', sort: 'name', page: 1 })
    expect(clientsSearchSchema.parse({ type: 'robot', sort: 'x', page: 0 })).toEqual({
      type: 'all',
      sort: 'name',
      page: 1,
    })
    expect(hasActiveFilters(clientsSearchSchema.parse({}))).toBe(false)
  })

  it('sends only what is set', () => {
    expect(toListClientsParams(clientsSearchSchema.parse({}))).toEqual({
      sort: 'name',
      page: 1,
      pageSize: PAGE_SIZE,
    })
    const search = clientsSearchSchema.parse({ q: ' pekara ', type: 'company', sort: 'newest' })
    expect(hasActiveFilters(search)).toBe(true)
    expect(toListClientsParams(search)).toEqual({
      q: 'pekara',
      type: 'company',
      sort: '-createdAt',
      page: 1,
      pageSize: PAGE_SIZE,
    })
  })
})
