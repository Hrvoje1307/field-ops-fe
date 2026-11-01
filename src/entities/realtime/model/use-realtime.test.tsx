import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { apiFetch } from '@/shared/api/api-fetch'
import { resetMockDb } from '@/shared/api/mocks/db'
import { dropConnections, openConnections } from '@/shared/api/mocks/lib/realtime'
import { server } from '@/shared/api/mocks/node'
import { signInForTest } from '@/shared/api/test/hook-test-utils'
import { isHubLive } from '@/shared/api/realtime/live-status'
import { env } from '@/shared/config/env'

import { channel, type LiveEvent } from './channel'
import { useRealtime } from './use-realtime'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
})

afterEach(async () => {
  dropConnections()
  await waitFor(() => {
    expect(openConnections()).toBe(0)
  })
  server.events.removeAllListeners()
})

function setup(tenantId = 'tenant-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const key of [['jobs', 'list'], ['dispatch', 'board', 'd'], ['skills']]) {
    queryClient.setQueryData(key, [])
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const view = renderHook(
    ({ id }) => {
      useRealtime(id)
    },
    {
      wrapper,
      initialProps: { id: tenantId },
    },
  )
  const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated ?? false
  const unmark = () => {
    for (const key of [['jobs', 'list'], ['dispatch', 'board', 'd'], ['skills']]) {
      queryClient.setQueryData(key, [])
    }
  }
  return { queryClient, view, stale, unmark }
}

/** Someone else cancels a job: another connection to the same API, so not this tab's write. */
async function someoneCancelsAJob() {
  const login = await fetch(`${env.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vlasnik@alarmko.test', password: 'demo' }),
  })
  const { accessToken } = (await login.json()) as { accessToken: string }
  const list = await fetch(`${env.apiUrl}/jobs?status=new&pageSize=3`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const jobId = ((await list.json()) as { items: { id: string }[] }).items[0]?.id
  await fetch(`${env.apiUrl}/jobs/${jobId ?? ''}/transition`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ to: 'cancelled', note: 'Test' }),
  })
  return jobId
}

describe('useRealtime', () => {
  it('connects while mounted, says so, and disconnects when unmounted', async () => {
    const { view } = setup()
    await waitFor(() => {
      expect(channel.getStatus()).toBe('connected')
    })
    expect(openConnections()).toBe(1)
    expect(isHubLive()).toBe(true)
    view.unmount()
    await waitFor(() => {
      expect(openConnections()).toBe(0)
    })
    expect(channel.getStatus()).toBe('disconnected')
    expect(isHubLive()).toBe(false)
  })

  it('a deal moved by someone else marks the sales data it names stale, not job data, and reaches no screen’s channel', async () => {
    const heard: LiveEvent[] = []
    const stop = channel.subscribeEvents((event) => heard.push(event))
    const { stale, queryClient } = setup()
    await waitFor(() => {
      expect(channel.getStatus()).toBe('connected')
    })
    const login = await fetch(`${env.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vlasnik@alarmko.test', password: 'demo' }),
    })
    const { accessToken } = (await login.json()) as { accessToken: string }
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    const board = (await (await fetch(`${env.apiUrl}/sales/board`, { headers })).json()) as {
      columns: { stage: { id: string }; deals: { id: string }[] }[]
    }
    const deal = board.columns[0]?.deals[0]
    const other = board.columns[0]?.deals[1]
    const target = board.columns[1]?.stage.id
    for (const key of [
      ['deals', 'board', {}],
      ['deals', 'today', {}],
      ['deals', 'detail', deal?.id],
      ['deals', 'detail', other?.id],
    ]) {
      queryClient.setQueryData(key, [])
    }
    await fetch(`${env.apiUrl}/sales/deals/${deal?.id ?? ''}/move`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ stageId: target }),
    })
    await waitFor(() => {
      expect(stale(['deals', 'detail', deal?.id])).toBe(true)
    })
    expect(stale(['deals', 'board', {}])).toBe(true)
    expect(stale(['deals', 'today', {}])).toBe(true)
    expect(stale(['deals', 'detail', other?.id])).toBe(false)
    expect(stale(['jobs', 'list'])).toBe(false)
    expect(heard).toEqual([])
    stop()
  })

  it('marks what shows jobs stale when someone else changes a job, and passes the events on', async () => {
    const heard: LiveEvent[] = []
    const stop = channel.subscribeEvents((event) => heard.push(event))
    const { stale } = setup()
    await waitFor(() => {
      expect(channel.getStatus()).toBe('connected')
    })
    const jobId = await someoneCancelsAJob()

    await waitFor(() => {
      expect(stale(['jobs', 'list'])).toBe(true)
    })
    expect(stale(['dispatch', 'board', 'd'])).toBe(true)
    expect(stale(['skills'])).toBe(false)
    expect(heard.map((event) => event.type)).toEqual(['JobUpdated', 'JobStatusChanged'])
    expect(heard[0]).toMatchObject({ payload: { jobId }, own: false })
    stop()
  })

  it('an event that follows this tab’s own write is marked as its own', async () => {
    const heard: LiveEvent[] = []
    const stop = channel.subscribeEvents((event) => heard.push(event))
    const { queryClient } = setup()
    await waitFor(() => {
      expect(channel.getStatus()).toBe('connected')
    })
    const jobs = await apiFetch<{ items: { id: string }[] }>('/jobs', {
      query: { status: ['new'], pageSize: 3 },
    })
    const jobId = jobs.items[0]?.id ?? ''
    // A write through the app's own mutation machinery, on the client the hook watches
    await new MutationObserver(queryClient, {
      mutationFn: () =>
        apiFetch(`/jobs/${jobId}/transition`, {
          method: 'POST',
          json: { to: 'cancelled', note: 'Test' },
        }),
    }).mutate()

    await waitFor(() => {
      expect(heard.length).toBeGreaterThanOrEqual(2)
    })
    expect(heard.every((event) => event.own)).toBe(true)
    stop()
  })

  it('a connection that was lost and is back refreshes, the first one does not', async () => {
    const { stale, unmark } = setup()
    await waitFor(() => {
      expect(channel.getStatus()).toBe('connected')
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(stale(['jobs', 'list'])).toBe(false)

    dropConnections()
    await waitFor(
      () => {
        expect(stale(['jobs', 'list'])).toBe(true)
      },
      { timeout: 10_000 },
    )
    expect(openConnections()).toBe(1)
    unmark()
  })

  it('another tenant is another connection: the old one is closed and a new one opened', async () => {
    let negotiations = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/negotiate')) negotiations += 1
    })
    const { view } = setup('tenant-1')
    await waitFor(() => {
      expect(openConnections()).toBe(1)
    })
    expect(negotiations).toBe(1)
    view.rerender({ id: 'tenant-2' })
    await waitFor(() => {
      expect(negotiations).toBe(2)
      expect(channel.getStatus()).toBe('connected')
      expect(openConnections()).toBe(1)
    })
  })
})
