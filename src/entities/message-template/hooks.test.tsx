import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { apiFetch } from '@/shared/api/api-fetch'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listMessageTemplates,
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useListMessageTemplates,
  usePreviewMessageTemplate,
  useUpdateMessageTemplate,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@bura.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const input = {
  key: 'reschedule_ack' as const,
  channel: 'sms' as const,
  locale: 'hr-HR',
  subject: null,
  body: 'Termin je promijenjen na {datum}.',
  isActive: true,
}

const KEYS = [['message-templates'], ['jobs', 'list'], ['skills']] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('message template hooks', () => {
  it('list the templates in effect', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListMessageTemplates(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.length).toBeGreaterThan(0)
    })
  })

  it('write, change and restore refresh the templates, and nothing else', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateMessageTemplate(), { wrapper })
    const update = renderHook(() => useUpdateMessageTemplate(), { wrapper })
    const remove = renderHook(() => useDeleteMessageTemplate(), { wrapper })
    const only = [true, false, false]

    seed(queryClient)
    let created = { id: '' }
    await act(async () => {
      created = await create.result.current.mutateAsync(input)
    })
    expect(refreshed(queryClient)).toEqual(only)

    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: created.id,
        body: { ...input, body: 'Drugi tekst', isActive: false },
      })
    })
    expect(refreshed(queryClient)).toEqual(only)
    expect(
      (await listMessageTemplates()).find((template) => template.id === created.id),
    ).toMatchObject({ body: 'Drugi tekst', isActive: false, isDefault: false })

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(only)
  })

  it('a text written meanwhile is a 409, and the list is refreshed to show it', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateMessageTemplate(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync(input)
    })
    seed(queryClient)
    let error: unknown
    await act(async () => {
      await create.result.current
        .mutateAsync({ ...input, body: 'Drugi pokušaj' })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(409)
    expect(refreshed(queryClient)).toEqual([true, false, false])
  })

  it('the same save tried again carries the same idempotency key', async () => {
    const { wrapper } = queryWrapper()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/message-templates')) {
        keys.push(request.headers.get('Idempotency-Key'))
      }
    })
    const create = renderHook(() => useCreateMessageTemplate(), { wrapper })
    const bad = { ...input, body: '   ' }
    await act(async () => {
      await create.result.current.mutateAsync(bad).catch(() => undefined)
      await create.result.current.mutateAsync(bad).catch(() => undefined)
    })
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })
})

describe('usePreviewMessageTemplate', () => {
  it('fills the text from sample data', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => usePreviewMessageTemplate('Bok {klijent} {x}'), { wrapper })
    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        rendered: 'Bok Ivan Horvat {x}',
        unknownPlaceholders: ['x'],
        smsSegments: 1,
      })
    })
  })

  it('with a job, fills the text from the job and asks for it by that job', async () => {
    const { wrapper } = queryWrapper()
    const jobs = await apiFetch<{ items: { id: string; number: string }[] }>('/jobs', {
      query: { pageSize: 1 },
    })
    const job = jobs.items[0]
    if (!job) throw new Error('Seed needs a job')
    const { result } = renderHook(() => usePreviewMessageTemplate('Nalog {broj_naloga}', job.id), {
      wrapper,
    })
    await waitFor(() => {
      expect(result.current.data?.rendered).toBe(`Nalog ${job.number}`)
    })
  })

  it('asks for nothing while there is no text', async () => {
    const { wrapper } = queryWrapper()
    let asked = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/message-templates/preview')) asked += 1
    })
    const { result } = renderHook(() => usePreviewMessageTemplate('  '), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(asked).toBe(0)
  })

  it('keeps the last preview while the next one is on its way', async () => {
    const { wrapper } = queryWrapper()
    const { result, rerender } = renderHook(({ body }) => usePreviewMessageTemplate(body), {
      wrapper,
      initialProps: { body: 'Prvi' },
    })
    await waitFor(() => {
      expect(result.current.data?.rendered).toBe('Prvi')
    })
    rerender({ body: 'Drugi' })
    expect(result.current.data?.rendered).toBe('Prvi')
    await waitFor(() => {
      expect(result.current.data?.rendered).toBe('Drugi')
    })
  })
})
