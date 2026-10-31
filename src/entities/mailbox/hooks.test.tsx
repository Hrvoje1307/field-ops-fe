import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listMailboxes,
  useCreateImapMailbox,
  useDeleteMailbox,
  useListMailboxes,
  useStartMailboxOAuth,
  useSyncMailbox,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const IMAP = {
  emailAddress: 'prodaja@alarmko.test',
  kind: 'shared',
  imapHost: 'imap.example.test',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: 'smtp.example.test',
  smtpPort: 587,
  smtpSecurity: 'starttls',
  username: 'prodaja@alarmko.test',
  password: 'x',
} as const

const KEYS = [
  ['mailboxes', 'list'],
  ['deals', 'today'],
  ['mail-threads', 'list'],
  ['drafts', 'list'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('mailbox hooks', () => {
  it('list the mailboxes the user may see', async () => {
    const { wrapper } = queryWrapper()
    const list = renderHook(() => useListMailboxes(), { wrapper })
    await waitFor(() => {
      expect(list.result.current.data?.map((m) => m.kind).sort()).toEqual(['personal', 'shared'])
    })
  })

  it('connecting by IMAP refreshes the list and Today (mailboxes needing attention)', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateImapMailbox(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await create.result.current.mutateAsync(IMAP)
    })
    expect(refreshed(queryClient)).toEqual([true, true, false, false])
    expect(await listMailboxes()).toHaveLength(3)
  })

  it('a failed connection test keeps its code and the server’s message for the form; nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateImapMailbox(), { wrapper })
    seed(queryClient)
    let error: unknown
    await act(async () => {
      await create.result.current
        .mutateAsync({ ...IMAP, smtpHost: 'smtp.nowhere.invalid' })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).problem).toMatchObject({ code: 'mailbox.smtp_failed' })
    expect(refreshed(queryClient)).toEqual([false, false, false, false])
  })

  it('a duplicate address is a 409 with sales.mailbox_exists', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateImapMailbox(), { wrapper })
    let error: unknown
    await act(async () => {
      await create.result.current
        .mutateAsync({ ...IMAP, emailAddress: 'info@alarmko.test' })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).problem).toMatchObject({ code: 'sales.mailbox_exists' })
  })

  it('OAuth start gives the provider URL and saves nothing', async () => {
    const { wrapper } = queryWrapper()
    const start = renderHook(() => useStartMailboxOAuth(), { wrapper })
    let url = ''
    await act(async () => {
      url = (await start.result.current.mutateAsync({ provider: 'gmail', kind: 'shared' }))
        .authorizeUrl
    })
    expect(new URL(url).searchParams.get('state')).toBeTruthy()
    expect(await listMailboxes()).toHaveLength(2)
  })

  it('disconnecting with purge refreshes all sales data, without it only mailboxes and Today', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const personal = (await listMailboxes()).find((m) => m.kind === 'personal')
    if (!personal) throw new Error('seed')
    const remove = renderHook(() => useDeleteMailbox(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync({ id: personal.id })
    })
    expect(refreshed(queryClient)).toEqual([true, true, false, false])
    const shared = (await listMailboxes())[0]
    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync({ id: shared?.id ?? '', purge: true })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, true])
  })

  it('sync answers 202; a mailbox that has to be connected again is a 409 sales.mailbox_needs_reauth', async () => {
    const { wrapper } = queryWrapper()
    const sync = renderHook(() => useSyncMailbox(), { wrapper })
    const shared = (await listMailboxes()).find((m) => m.kind === 'shared')
    await act(async () => {
      await sync.result.current.mutateAsync(shared?.id ?? '')
    })
    expect(sync.result.current.isSuccess).toBe(true)

    const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
    const row = t?.sales.mailboxes.find((m) => m.id === shared?.id)
    if (row) row.status = 'needs_reauth'
    const error = await sync.result.current.mutateAsync(shared?.id ?? '').catch((e: unknown) => e)
    expect((error as ApiError).problem).toMatchObject({ code: 'sales.mailbox_needs_reauth' })
  })
})
