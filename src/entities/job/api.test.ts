import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/shared/api/mocks/node'

import { getJob, invalidateJobData, isJobDataKey, jobKeys, listJobs, transitionJob } from './api'

const API = 'http://localhost/api/v1'

describe('job requests', () => {
  it('call the contract paths', async () => {
    const seen: string[] = []
    server.use(
      http.all(`${API}/jobs*`, ({ request }) => {
        seen.push(`${request.method} ${request.url.replace(API, '')}`)
        return HttpResponse.json({})
      }),
    )
    await listJobs({ status: ['new', 'on_hold'], page: 2 })
    await getJob('a/b')
    await transitionJob('j1', { to: 'confirmed', version: 3 })
    expect(seen).toEqual([
      'GET /jobs?status=new%2Con_hold&page=2',
      'GET /jobs/a%2Fb',
      'POST /jobs/j1/transition',
    ])
  })
})

describe('invalidateJobData', () => {
  it('matches the keys of every API area that shows job data', () => {
    const jobData = [
      jobKeys.all,
      jobKeys.list({ status: ['new'], page: 2 }),
      jobKeys.detail('abc'),
      jobKeys.history('abc'),
      ['clients', 'detail', 'c1'],
      ['technicians', 'schedule', 't1', { date: '2026-10-24' }],
      ['dispatch', 'board', { date: '2026-10-24' }],
      ['reports', 'jobs-summary'],
    ]
    const otherData = [
      ['job-types'],
      ['custom-fields', { entity: 'job' }],
      ['auth', 'me'],
      ['tenant'],
    ]
    for (const key of jobData) expect(isJobDataKey(key), JSON.stringify(key)).toBe(true)
    for (const key of otherData) expect(isJobDataKey(key), JSON.stringify(key)).toBe(false)
  })

  it('invalidates job data and leaves configuration and session data alone', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(jobKeys.detail('abc'), { id: 'abc' })
    queryClient.setQueryData(['job-types'], [])
    queryClient.setQueryData(['auth', 'me'], {})

    await invalidateJobData(queryClient)

    const invalidated = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false
    expect(invalidated(jobKeys.detail('abc'))).toBe(true)
    expect(invalidated(['job-types'])).toBe(false)
    expect(invalidated(['auth', 'me'])).toBe(false)
  })
})
