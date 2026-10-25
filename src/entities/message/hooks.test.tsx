import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { apiFetch } from '@/shared/api/api-fetch'
import type { JobSummaryPage } from '@/shared/api/generated/model'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { useListMessages, useNotifyClient } from './api'

vi.mock('./const', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./const')>()),
  MESSAGE_POLL_MS: 40,
}))

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

function aJob() {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  const job = t?.jobs.find(
    (j) =>
      j.status === 'scheduled' &&
      t.contacts.some((c) => c.clientId === j.clientId && c.phone && c.receivesSms),
  )
  if (!job) throw new Error('Seed needs a job with a phone')
  return job
}

const message = (status: string) => ({
  id: crypto.randomUUID(),
  jobId: null,
  channel: 'sms',
  templateKey: null,
  to: '+385911111111',
  subject: null,
  body: 'Bok',
  status,
  error: null,
  segments: 1,
  cost: '0.05',
  sentAt: null,
  deliveredAt: null,
  createdAt: new Date().toISOString(),
})

describe('useListMessages', () => {
  it('lists the messages', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListMessages({}), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.totalCount).toBeGreaterThan(0)
    })
  })

  it('reads again while a message is on its way, and stops once it has arrived', async () => {
    let calls = 0
    let status = 'sent'
    server.use(
      http.get(`${API}/messages`, () => {
        calls += 1
        return HttpResponse.json({
          page: 1,
          pageSize: 50,
          totalCount: 1,
          items: [message(status)],
        })
      }),
    )
    const { wrapper } = queryWrapper()
    renderHook(() => useListMessages({}), { wrapper })
    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(3)
    })
    status = 'delivered'
    const seen = calls
    await waitFor(() => {
      expect(calls).toBeGreaterThan(seen)
    })
    const settled = calls
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(calls).toBe(settled)
  })

  it('does not poll a list where everything has arrived or failed', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/messages`, () => {
        calls += 1
        return HttpResponse.json({
          page: 1,
          pageSize: 50,
          totalCount: 2,
          items: [message('delivered'), message('failed')],
        })
      }),
    )
    const { wrapper } = queryWrapper()
    renderHook(() => useListMessages({}), { wrapper })
    await waitFor(() => {
      expect(calls).toBe(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(calls).toBe(1)
  })
})

describe('useNotifyClient', () => {
  it('sends, and the messages and the usage are read again', async () => {
    const job = aJob()
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(['messages', 'list', {}], {})
    queryClient.setQueryData(['tenant', 'usage', '2026-10'], {})
    queryClient.setQueryData(['skills'], [])
    const notify = renderHook(() => useNotifyClient(), { wrapper })
    let sent: unknown[] = []
    await act(async () => {
      sent = await notify.result.current.mutateAsync({
        jobId: job.id,
        body: { channel: 'sms', templateKey: 'on_the_way' },
      })
    })
    expect(sent.length).toBeGreaterThan(0)
    expect(isInvalidated(queryClient, ['messages', 'list', {}])).toBe(true)
    expect(isInvalidated(queryClient, ['tenant', 'usage', '2026-10'])).toBe(true)
    expect(isInvalidated(queryClient, ['skills'])).toBe(false)
    const page = await apiFetch<JobSummaryPage>('/jobs', { query: { pageSize: 1 } })
    expect(page.items.length).toBeGreaterThan(0)
  })

  it('nobody to send to is a 422 with a reason, and nothing is read again', async () => {
    const job = aJob()
    const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
    for (const c of t?.contacts ?? []) if (c.clientId === job.clientId) c.phone = null
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(['messages', 'list', {}], {})
    const notify = renderHook(() => useNotifyClient(), { wrapper })
    let error: unknown
    await act(async () => {
      await notify.result.current
        .mutateAsync({ jobId: job.id, body: { channel: 'sms', body: 'x' } })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).problem).toMatchObject({ code: 'notify.no_recipient' })
    expect(isInvalidated(queryClient, ['messages', 'list', {}])).toBe(false)
  })

  it('the same send tried again carries the same idempotency key', async () => {
    const job = aJob()
    const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
    for (const c of t?.contacts ?? []) if (c.clientId === job.clientId) c.phone = null
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/notify')) keys.push(request.headers.get('Idempotency-Key'))
    })
    const { wrapper } = queryWrapper()
    const notify = renderHook(() => useNotifyClient(), { wrapper })
    const request = { jobId: job.id, body: { channel: 'sms' as const, body: 'x' } }
    await act(async () => {
      await notify.result.current.mutateAsync(request).catch(() => undefined)
      await notify.result.current.mutateAsync(request).catch(() => undefined)
    })
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })
})
