import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '@/shared/api/api-fetch'
import type { Job, JobSummaryPage } from '@/shared/api/generated/model'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  getJobReport,
  reportKeys,
  uploadAttachment,
  useAddJobMaterial,
  useGetJobReport,
  useListCatalogItems,
  useSaveJobReport,
  useSignReport,
  useUpdateChecklist,
  useUploadJobFile,
} from './api'

const API = 'http://localhost/api/v1'
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer

beforeEach(async () => {
  resetMockDb()
  await signInForTest('ivan@alarmko.test')
})

afterEach(() => {
  vi.restoreAllMocks()
  server.events.removeAllListeners()
})

/** The job Ivan is on site at. */
async function onSiteJob() {
  const jobs = await apiFetch<JobSummaryPage>('/jobs', { query: { status: ['on_site'] } })
  const summary = jobs.items[0]
  if (!summary) throw new Error('Seed needs an on_site job')
  return apiFetch<Job>(`/jobs/${summary.id}`)
}

const png = () => new Blob([PNG], { type: 'image/png' })

describe('useSaveJobReport', () => {
  it('puts the saved report in the cache', async () => {
    const job = await onSiteJob()
    const { queryClient, wrapper } = queryWrapper()
    const { result } = renderHook(() => useSaveJobReport(job.id), { wrapper })

    await act(() => result.current.mutateAsync({ workDone: 'Gotovo.' }))

    expect(queryClient.getQueryData<{ workDone: string }>(reportKeys.job(job.id))?.workDone).toBe(
      'Gotovo.',
    )
  })

  it('shows what is sent in the cached report at once, and takes it back when the save fails', async () => {
    const job = await onSiteJob()
    const report = await getJobReport(job.id)
    let offline = false
    let slow = true
    server.use(
      http.put(`${API}/jobs/:id/report`, async () => {
        if (offline) return HttpResponse.error()
        if (slow) await new Promise((resolve) => setTimeout(resolve, 300))
        return undefined
      }),
    )
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(reportKeys.job(job.id), report)
    const { result } = renderHook(() => useSaveJobReport(job.id), { wrapper })
    const cached = () =>
      queryClient.getQueryData<{ workDone: string | null }>(reportKeys.job(job.id))?.workDone

    let pending: Promise<unknown> = Promise.resolve()
    let answered = false
    act(() => {
      pending = result.current.mutateAsync({ workDone: 'Upisano' }).then(() => {
        answered = true
      })
    })
    // Before the answer is in (it takes 300 ms)
    await waitFor(() => {
      expect(cached()).toBe('Upisano')
    })
    expect(answered).toBe(false)
    await act(() => pending)
    slow = false

    offline = true
    await act(async () => {
      await result.current.mutateAsync({ workDone: 'Neće proći' }).catch(() => undefined)
    })
    expect(cached()).toBe('Upisano')
  })

  it('409: tells the user and refreshes job data', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.put(`${API}/jobs/:id/report`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const job = await onSiteJob()
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(['jobs', 'list', {}], { items: [] })
    const { result } = renderHook(() => useSaveJobReport(job.id), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ workDone: 'x' }).catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledWith(
      'Nalog je u međuvremenu promijenjen. Izvještaj se u tom statusu ne može mijenjati.',
    )
    expect(queryClient.getQueryState(['jobs', 'list', {}])?.isInvalidated).toBe(true)
  })

  it('trying again with the same body reuses the idempotency key; a done save does not', async () => {
    const job = await onSiteJob()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT' && request.url.endsWith('/report')) {
        keys.push(request.headers.get('Idempotency-Key'))
      }
    })
    let failures = 1
    server.use(
      http.put(`${API}/jobs/:id/report`, () => (failures-- > 0 ? HttpResponse.error() : undefined)),
    )
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useSaveJobReport(job.id), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ workDone: 'a' }).catch(() => undefined)
    })
    await act(() => result.current.mutateAsync({ workDone: 'a' }))
    await act(() => result.current.mutateAsync({ workDone: 'a' }))

    expect(keys).toHaveLength(3)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[1])
  })
})

describe('useUpdateChecklist', () => {
  it('shows the tick at once, and keeps the list the API answers with', async () => {
    const job = await onSiteJob()
    const report = await getJobReport(job.id)
    const item = report.checklist.find((candidate) => !candidate.isDone)
    if (!item) throw new Error('Seed needs an open item')
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(reportKeys.job(job.id), report)
    const { result } = renderHook(() => useUpdateChecklist(job.id), { wrapper })

    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = result.current.mutateAsync([{ id: item.id, isDone: true }])
    })
    await waitFor(() => {
      const cached = queryClient.getQueryData<typeof report>(reportKeys.job(job.id))
      expect(cached?.checklist.find((i) => i.id === item.id)?.isDone).toBe(true)
    })
    await act(() => pending)
    const done = queryClient.getQueryData<typeof report>(reportKeys.job(job.id))
    expect(done?.checklist.find((i) => i.id === item.id)).toMatchObject({
      isDone: true,
      doneByName: 'Ivan Horvat',
    })
  })

  it('takes the tick back when the request fails', async () => {
    server.use(http.put(`${API}/jobs/:id/checklist`, () => HttpResponse.error()))
    const job = await onSiteJob()
    const report = await getJobReport(job.id)
    const item = report.checklist.find((candidate) => !candidate.isDone)
    if (!item) throw new Error('Seed needs an open item')
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(reportKeys.job(job.id), report)
    const { result } = renderHook(() => useUpdateChecklist(job.id), { wrapper })

    await act(async () => {
      await result.current.mutateAsync([{ id: item.id, isDone: true }]).catch(() => undefined)
    })

    const cached = queryClient.getQueryData<typeof report>(reportKeys.job(job.id))
    expect(cached?.checklist.find((i) => i.id === item.id)?.isDone).toBe(false)
  })
})

describe('useAddJobMaterial', () => {
  it('fetches the report again for the new line and the sum', async () => {
    const job = await onSiteJob()
    const { wrapper } = queryWrapper()
    const report = renderHook(() => useGetJobReport(job.id), { wrapper })
    const catalog = renderHook(() => useListCatalogItems({}), { wrapper })
    await waitFor(() => {
      expect(report.result.current.data).toBeDefined()
      expect(catalog.result.current.data).toBeDefined()
    })
    const item = catalog.result.current.data?.items[0]
    if (!item) throw new Error('Seed needs a catalog item')
    const add = renderHook(() => useAddJobMaterial(job.id), { wrapper })

    await act(() => add.result.current.mutateAsync({ catalogItemId: item.id, quantity: '2' }))

    await waitFor(() => {
      expect(report.result.current.data?.materials).toHaveLength(1)
    })
    expect(report.result.current.data?.totalMaterials).not.toBe('0.00')
  })
})

describe('uploading a file', () => {
  it('goes upload-url, PUT without the bearer token and with the signed headers, then confirm', async () => {
    const job = await onSiteJob()
    const seen: { method: string; auth: string | null; type: string | null; url: string }[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/mock-storage/') || request.url.includes('/attachments')) {
        seen.push({
          method: request.method,
          auth: request.headers.get('Authorization'),
          type: request.headers.get('Content-Type'),
          url: new URL(request.url).pathname,
        })
      }
    })
    const { wrapper } = queryWrapper()
    const report = renderHook(() => useGetJobReport(job.id), { wrapper })
    await waitFor(() => {
      expect(report.result.current.data).toBeDefined()
    })
    const upload = renderHook(() => useUploadJobFile(job.id), { wrapper })

    const attachment = await act(() =>
      upload.result.current.mutateAsync({ kind: 'photo', file: png(), fileName: 'a.png' }),
    )

    expect(seen.map((s) => `${s.method} ${s.url.replace(/[0-9a-f-]{36}/, ':id')}`)).toEqual([
      'POST /api/v1/attachments/upload-url',
      'PUT /api/v1/mock-storage/:id',
      'POST /api/v1/attachments',
    ])
    const put = seen[1]
    expect(put?.auth).toBeNull()
    expect(put?.type).toBe('image/png')
    await waitFor(() => {
      expect(report.result.current.data?.photos.map((p) => p.id)).toEqual([attachment.id])
    })
  })

  it('trying again with the same file resumes: no second upload-url, and no second PUT once the bytes are there', async () => {
    const job = await onSiteJob()
    const calls: string[] = []
    server.events.on('request:start', ({ request }) => {
      const path = new URL(request.url).pathname.replace('/api/v1', '')
      if (path.startsWith('/attachments') || path.startsWith('/mock-storage')) {
        calls.push(`${request.method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`)
      }
    })
    let failures = 1
    server.use(
      http.post(`${API}/attachments`, () => (failures-- > 0 ? HttpResponse.error() : undefined)),
    )
    const file = png()
    const request = { ownerType: 'job' as const, ownerId: job.id, kind: 'photo' as const, file }

    await uploadAttachment(request).catch(() => undefined)
    const attachment = await uploadAttachment(request)

    expect(calls).toEqual([
      'POST /attachments/upload-url',
      'PUT /mock-storage/:id',
      'POST /attachments', // failed
      'POST /attachments', // again, nothing else repeated
    ])
    expect(attachment.kind).toBe('photo')
    // A finished upload is not repeated
    await uploadAttachment(request)
    expect(calls).toHaveLength(4)
  })

  it('a failed PUT to storage is an error carrying the status', async () => {
    const job = await onSiteJob()
    server.use(http.put(`${API}/mock-storage/:id`, () => new HttpResponse(null, { status: 403 })))
    await expect(
      uploadAttachment({ ownerType: 'job', ownerId: job.id, kind: 'photo', file: png() }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('useSignReport', () => {
  it('uploads the PNG, links it with the name, and puts the report in the cache', async () => {
    const job = await onSiteJob()
    const { queryClient, wrapper } = queryWrapper()
    const { result } = renderHook(() => useSignReport(job.id), { wrapper })

    const report = await act(() =>
      result.current.mutateAsync({ png: png(), signedByName: 'Marko Horizont' }),
    )

    expect(report.signedByName).toBe('Marko Horizont')
    expect(report.signatureAttachmentId).toBeTruthy()
    expect(
      queryClient.getQueryData<{ signedByName: string }>(reportKeys.job(job.id))?.signedByName,
    ).toBe('Marko Horizont')
  })
})

describe('useGetJobReport polling', () => {
  it('looks again while the PDF of a completed job is not ready, and stops when it is', async () => {
    const job = await onSiteJob()
    const base = await getJobReport(job.id)
    const completed = { ...base, completedAt: new Date().toISOString(), pdfAttachmentId: null }
    let calls = 0
    server.use(
      http.get(`${API}/jobs/:id/report`, () => {
        calls += 1
        return HttpResponse.json(calls >= 2 ? { ...completed, pdfAttachmentId: 'pdf' } : completed)
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { wrapper } = queryWrapper()
      const { result } = renderHook(() => useGetJobReport(job.id), { wrapper })
      await waitFor(() => {
        expect(result.current.data?.pdfAttachmentId).toBeNull()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500)
      })
      await waitFor(() => {
        expect(result.current.data?.pdfAttachmentId).toBe('pdf')
      })
      const settled = calls
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(calls).toBe(settled)
    } finally {
      vi.useRealTimers()
    }
  })
})
