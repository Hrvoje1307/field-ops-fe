import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { MOCK_AI_LATENCY_MS } from '@/shared/api/mocks/lib/sales/const'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listDrafts,
  useCreateDraft,
  useDiscardDraft,
  useGetDraft,
  useListDrafts,
  useSaveDraftToMailbox,
  useSendDraft,
  useUpdateDraft,
} from './api'
import { DRAFT_POLL_MS } from './const'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.useRealTimers()
})

const alarmko = () => {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  if (!t) throw new Error('seed')
  return t
}
const threadOf = (subject: string) => {
  const row = alarmko().sales.threads.find((th) => th.subject === subject)
  if (!row) throw new Error(`No thread ${subject}`)
  return row.id
}
const KEYS = [
  ['drafts', 'list'],
  ['mail-threads', 'detail'],
  ['deals', 'today'],
  ['jobs', 'list'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('draft hooks', () => {
  it('the list defaults to what is to be reviewed', async () => {
    const { wrapper } = queryWrapper()
    const list = renderHook(() => useListDrafts(), { wrapper })
    await waitFor(() => {
      expect(list.result.current.data?.map((d) => d.status).sort()).toEqual([
        'edited',
        'generating',
        'ready',
        'ready',
      ])
    })
  })

  it('creating answers "generating" and the draft is read again every few seconds until it is ready', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateDraft(), { wrapper })
    seed(queryClient)
    let id = ''
    await act(async () => {
      id = (
        await create.result.current.mutateAsync({
          threadId: threadOf('Zanima me protuprovalni sustav'),
          body: { kind: 'reply', instructions: 'Ponudi utorak.' },
        })
      ).id
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, false])

    const draft = renderHook(() => useGetDraft(id), { wrapper })
    await waitFor(() => {
      expect(draft.result.current.data?.status).toBe('generating')
    })
    const query = queryClient.getQueryCache().find({ queryKey: ['drafts', 'detail', id] })
    const interval = query?.observers[0]?.options.refetchInterval
    expect(typeof interval === 'function' ? interval(query as never) : interval).toBe(DRAFT_POLL_MS)

    vi.setSystemTime(new Date(Date.now() + MOCK_AI_LATENCY_MS + 1000))
    await act(async () => {
      await draft.result.current.refetch()
    })
    await waitFor(() => {
      expect(draft.result.current.data?.status).toBe('ready')
    })
    expect(typeof interval === 'function' ? interval(query as never) : interval).toBe(false)
  })

  it('429 over the allowance keeps Retry-After; 409 when the mailbox cannot send', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateDraft(), { wrapper })
    const threadId = threadOf('Zanima me protuprovalni sustav')
    const mailbox = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (mailbox) mailbox.canSend = false
    let error = await create.result.current
      .mutateAsync({ threadId, body: { kind: 'reply' } })
      .catch((e: unknown) => e)
    expect((error as ApiError).problem).toMatchObject({ code: 'mailbox.cannot_send' })
    if (mailbox) mailbox.canSend = true
    const usage = alarmko().usage.at(-1)
    if (usage) usage.aiDrafts = 10_000
    // (another body: the same one would replay the stored answer of the first try)
    error = await create.result.current
      .mutateAsync({ threadId, body: { kind: 'reply', instructions: 'Još jednom.' } })
      .catch((e: unknown) => e)
    expect((error as ApiError).problem).toMatchObject({ code: 'sales.ai_quota_exceeded' })
    expect((error as ApiError).status).toBe(429)
    expect((error as ApiError).retryAfter).toBeGreaterThan(0)
  })

  it('editing with a stale version is a 409: tells the user and refreshes', async () => {
    const warning = vi.spyOn(toast, 'warning')
    const { queryClient, wrapper } = queryWrapper()
    const ready = (await listDrafts({})).find((d) => d.status === 'ready')
    if (!ready) throw new Error('seed')
    const update = renderHook(() => useUpdateDraft(), { wrapper })
    const body = { subject: 'a', bodyText: 'b', to: ready.to, cc: [], version: ready.version }
    await act(async () => {
      await update.result.current.mutateAsync({ id: ready.id, body })
    })
    expect(
      queryClient.getQueryData<{ status: string }>(['drafts', 'detail', ready.id])?.status,
    ).toBe('edited')
    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({ id: ready.id, body }).catch(() => undefined)
    })
    // One notice, in the words of the error map for the code the API sent
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(
      'Podatak je u međuvremenu promijenjen. Prikazani su najnoviji podaci.',
    )
    expect(refreshed(queryClient).slice(0, 3)).toEqual([true, true, true])
  })

  it('saving to the mailbox, sending and discarding', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const drafts = (await listDrafts({})).filter((d) => d.status === 'ready')
    const [first, second] = drafts
    if (!first || !second) throw new Error('seed')
    const save = renderHook(() => useSaveDraftToMailbox(), { wrapper })
    await act(async () => {
      await save.result.current.mutateAsync(first.id)
    })
    expect(
      queryClient.getQueryData<{ status: string }>(['drafts', 'detail', first.id])?.status,
    ).toBe('saved_to_mailbox')

    const send = renderHook(() => useSendDraft(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await send.result.current.mutateAsync({ id: second.id, body: { version: second.version } })
    })
    expect(
      queryClient.getQueryData<{ status: string }>(['drafts', 'detail', second.id])?.status,
    ).toBe('sent')
    // Sending changes the conversation, the deal's timeline and Today
    expect(refreshed(queryClient)).toEqual([true, true, true, false])

    const discard = renderHook(() => useDiscardDraft(), { wrapper })
    const third = (await listDrafts({})).find((d) => d.status === 'edited')
    await act(async () => {
      await discard.result.current.mutateAsync(third?.id ?? '')
    })
    expect((await listDrafts({})).map((d) => d.id)).not.toContain(third?.id)
  })
})
