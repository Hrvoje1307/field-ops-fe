import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { getGetTenantQueryKey } from '@/shared/api/generated/tenant/tenant'

import { invalidateJobData, isJobDataKey } from './invalidate'
import { jobQueries } from './queries'

describe('invalidateJobData', () => {
  it('matches every cached response with job data, by the path at the start of the key', () => {
    const jobData = [
      jobQueries.list().queryKey,
      jobQueries.list({ status: ['new'], page: 2 }).queryKey,
      jobQueries.detail('abc').queryKey,
      jobQueries.history('abc').queryKey,
      ['/jobs/abc/report'],
      jobQueries.myDay({ date: '2026-10-24' }).queryKey,
      ['/technicians/t1/schedule', { date: '2026-10-24' }],
      ['/dispatch/board', { date: '2026-10-24' }],
      ['/clients', { page: 1 }],
      ['/clients/c1'],
      ['/reports/jobs-summary', {}],
    ]
    const otherData = [
      ['/job-types'],
      ['/custom-fields', { entity: 'job' }],
      ['/me'],
      getGetTenantQueryKey(),
      ['/technicians'],
      ['/technicians/t1'],
      ['/clients/c1/locations'],
      ['/locations/l1'],
      ['/jobsx'],
    ]
    for (const key of jobData) expect(isJobDataKey(key), JSON.stringify(key)).toBe(true)
    for (const key of otherData) expect(isJobDataKey(key), JSON.stringify(key)).toBe(false)
  })

  it('invalidates job data and leaves configuration and session data alone', async () => {
    const queryClient = new QueryClient()
    const detail = jobQueries.detail('abc').queryKey
    queryClient.setQueryData(detail, { id: 'abc' } as never)
    queryClient.setQueryData(['/me/jobs', { date: '2026-10-24' }], { jobs: [] })
    queryClient.setQueryData(['/job-types'], [])
    queryClient.setQueryData(['/me'], {})

    await invalidateJobData(queryClient)

    const invalidated = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false
    expect(invalidated(detail)).toBe(true)
    expect(invalidated(['/me/jobs', { date: '2026-10-24' }])).toBe(true)
    expect(invalidated(['/job-types'])).toBe(false)
    expect(invalidated(['/me'])).toBe(false)
  })
})
