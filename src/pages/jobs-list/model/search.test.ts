import { describe, expect, it } from 'vitest'

import { hasActiveFilters, jobsSearchSchema, PAGE_SIZE, toListJobsParams } from './search'

const parse = (input: Record<string, unknown>) => jobsSearchSchema.parse(input)
const TODAY = '2026-10-24'

describe('jobsSearchSchema', () => {
  it('defaults to open jobs, any date, newest first, page 1', () => {
    expect(parse({})).toEqual({ status: 'open', date: 'any', sort: 'newest', page: 1 })
    expect(hasActiveFilters(parse({}))).toBe(false)
  })

  it('falls back instead of failing on values a link or a person typed wrong', () => {
    expect(
      parse({ status: 'closed', date: 'yesterday', sort: 'random', page: -2, priority: 'meh' }),
    ).toEqual({ status: 'open', date: 'any', sort: 'newest', page: 1 })
  })

  it('keeps valid filters', () => {
    const search = parse({ status: 'on_hold', priority: 'urgent', jobTypeId: 'jt-1', q: 'ilica' })
    expect(search).toMatchObject({ status: 'on_hold', priority: 'urgent', jobTypeId: 'jt-1' })
    expect(hasActiveFilters(search)).toBe(true)
  })
})

describe('toListJobsParams', () => {
  it('turns status presets into the statuses they stand for', () => {
    expect(toListJobsParams(parse({}), TODAY).status).toEqual([
      'new',
      'scheduled',
      'confirmed',
      'en_route',
      'on_site',
      'on_hold',
    ])
    expect(toListJobsParams(parse({ status: 'done' }), TODAY).status).toEqual([
      'completed',
      'invoiced',
    ])
    expect(toListJobsParams(parse({ status: 'all' }), TODAY)).not.toHaveProperty('status')
    expect(toListJobsParams(parse({ status: 'cancelled' }), TODAY).status).toEqual(['cancelled'])
  })

  it('resolves date presets against the tenant’s today', () => {
    expect(toListJobsParams(parse({ date: 'today' }), TODAY)).toMatchObject({
      from: TODAY,
      to: TODAY,
    })
    expect(toListJobsParams(parse({ date: 'tomorrow' }), TODAY)).toMatchObject({
      from: '2026-10-25',
      to: '2026-10-25',
    })
    expect(toListJobsParams(parse({ date: 'next7' }), TODAY)).toMatchObject({
      from: TODAY,
      to: '2026-10-30',
    })
    const unscheduled = toListJobsParams(parse({ date: 'unscheduled' }), TODAY)
    expect(unscheduled.unscheduled).toBe(true)
    // The API rejects unscheduled together with from/to
    expect(unscheduled).not.toHaveProperty('from')
  })

  it('sends only the filters that are set, the sort and the page', () => {
    expect(
      toListJobsParams(
        parse({ status: 'all', q: '  ilica ', technicianId: 't-1', sort: 'priority', page: 3 }),
        TODAY,
      ),
    ).toEqual({ q: 'ilica', technicianId: 't-1', sort: '-priority', page: 3, pageSize: PAGE_SIZE })
    expect(toListJobsParams(parse({ status: 'all', q: '   ' }), TODAY)).not.toHaveProperty('q')
  })
})
