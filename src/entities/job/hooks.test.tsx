import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '@/shared/api/api-fetch'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { getJob, jobKeys, listJobs, useAssignJob, useCreateJob, useTransitionJob } from './api'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A scheduled job the office may move on (a stale-prone target for every test). */
async function scheduledJob() {
  const page = await listJobs({ status: ['scheduled'], pageSize: 1 })
  const summary = page.items[0]
  if (!summary) throw new Error('Seed needs a scheduled job')
  return getJob(summary.id)
}

/** Cached data under job keys, a client key and a configuration key. */
function seedCache(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  queryClient.setQueryData(['jobs', 'list', { page: 1 }], { items: [] })
  queryClient.setQueryData(['clients', 'detail', 'c1'], { id: 'c1' })
  queryClient.setQueryData(['dispatch', 'board', '2026-10-28'], { columns: [] })
  queryClient.setQueryData(['job-types'], [])
}
const staleness = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) => ({
  jobs: isInvalidated(queryClient, ['jobs', 'list', { page: 1 }]),
  clients: isInvalidated(queryClient, ['clients', 'detail', 'c1']),
  board: isInvalidated(queryClient, ['dispatch', 'board', '2026-10-28']),
  jobTypes: isInvalidated(queryClient, ['job-types']),
})

describe('useTransitionJob', () => {
  it('puts the returned job in the detail cache and refreshes job data, nothing else', async () => {
    const job = await scheduledJob()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useTransitionJob(), { wrapper })

    await act(() => result.current.mutateAsync({ job, to: 'confirmed' }))

    expect(queryClient.getQueryData(jobKeys.detail(job.id))).toMatchObject({
      id: job.id,
      status: 'confirmed',
      version: job.version + 1,
    })
    expect(staleness(queryClient)).toEqual({
      jobs: true,
      clients: true,
      board: true,
      jobTypes: false,
    })
  })

  it('409: tells the user and refreshes job data', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.post(`${API}/jobs/:id/transition`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const job = await scheduledJob()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useTransitionJob(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ job, to: 'confirmed' }).catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledWith(
      'Nalog je u međuvremenu promijenjen. Prikazani su najnoviji podaci.',
    )
    expect(staleness(queryClient).jobs).toBe(true)
  })
})

describe('useAssignJob', () => {
  it('puts the returned job in the detail cache and refreshes job data', async () => {
    const job = await scheduledJob()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useAssignJob(), { wrapper })

    await act(() =>
      result.current.mutateAsync({
        id: job.id,
        body: { technicianIds: [], version: job.version },
      }),
    )

    expect(queryClient.getQueryData(jobKeys.detail(job.id))).toMatchObject({ status: 'new' })
    expect(staleness(queryClient)).toEqual({
      jobs: true,
      clients: true,
      board: true,
      jobTypes: false,
    })
  })

  it('409: tells the user and refreshes job data', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.post(`${API}/jobs/:id/assign`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const job = await scheduledJob()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useAssignJob(), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ id: job.id, body: { technicianIds: [], version: job.version } })
        .catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledOnce()
    expect(staleness(queryClient).jobs).toBe(true)
  })
})

describe('useCreateJob', () => {
  it('refreshes job data after creating', async () => {
    const [clients, types] = await Promise.all([
      apiFetch<{ items: { id: string }[] }>('/clients', { query: { pageSize: 1 } }),
      apiFetch<{ id: string }[]>('/job-types'),
    ])
    const clientId = clients.items[0]?.id
    const jobTypeId = types[0]?.id
    if (!clientId || !jobTypeId) throw new Error('Seed needs a client and a job type')
    const client = await apiFetch<{ locations: { id: string }[] }>(`/clients/${clientId}`)
    const locationId = client.locations[0]?.id
    if (!locationId) throw new Error('Seed needs a location')

    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useCreateJob(), { wrapper })
    await act(() =>
      result.current.mutateAsync({ clientId, locationId, jobTypeId, title: 'Novi nalog' }),
    )

    await waitFor(() => {
      expect(staleness(queryClient)).toEqual({
        jobs: true,
        clients: true,
        board: true,
        jobTypes: false,
      })
    })
  })
})
