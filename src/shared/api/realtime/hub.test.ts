import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { dropConnections, openConnections } from '@/shared/api/mocks/lib/realtime'
import { server } from '@/shared/api/mocks/node'
import { signInForTest } from '@/shared/api/test/hook-test-utils'
import { apiFetch } from '@/shared/api/api-fetch'
import { env } from '@/shared/config/env'

import { type HubEvent, type HubStatus, startHub } from './hub'

const until = (check: () => boolean, ms = 3000) =>
  vi.waitFor(
    () => {
      if (!check()) throw new Error('not yet')
    },
    { timeout: ms, interval: 10 },
  )

let token: string | null = null

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
  token = null
})

afterEach(async () => {
  dropConnections()
  await until(() => openConnections() === 0)
  server.events.removeAllListeners()
})

/** Signs in as someone else and reads their token from the login. */
async function tokenOf(email: string): Promise<string> {
  const response = await fetch(`${env.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo' }),
  })
  return ((await response.json()) as { accessToken: string }).accessToken
}

function connect(email: string, extra: Partial<Parameters<typeof startHub>[0]> = {}) {
  const events: HubEvent[] = []
  const statuses: HubStatus[] = []
  const hub = startHub({
    url: env.hubUrl,
    getAccessToken: () => token,
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
    retryDelay: () => 20,
    ...extra,
  })
  return { hub, events, statuses, email }
}

describe('startHub', () => {
  it('connects with the token and says so', async () => {
    token = await tokenOf('dispecer@alarmko.test')
    const { hub, statuses } = connect('dispecer@alarmko.test')
    await until(() => statuses.includes('connected'))
    expect(openConnections()).toBe(1)
    await hub.stop()
    await until(() => openConnections() === 0)
    expect(statuses.at(-1)).toBe('disconnected')
  })

  it('hears what a write by someone else changed', async () => {
    token = await tokenOf('dispecer@alarmko.test')
    const { hub, events, statuses } = connect('dispecer@alarmko.test')
    await until(() => statuses.includes('connected'))

    const jobs = await apiFetch<{ items: { id: string; status: string }[] }>('/jobs', {
      query: { status: ['new'], pageSize: 5 },
    })
    const job = jobs.items[0]
    if (!job) throw new Error('Seed needs a new job')
    await apiFetch(`/jobs/${job.id}/transition`, {
      method: 'POST',
      json: { to: 'cancelled', note: 'Test' },
    })

    await until(() => events.some((event) => event.type === 'JobStatusChanged'))
    expect(events.map((event) => event.type)).toEqual(['JobUpdated', 'JobStatusChanged'])
    expect(events[0]?.payload).toMatchObject({ jobId: job.id })
    expect(events[1]?.payload).toMatchObject({ jobId: job.id, from: 'new', to: 'cancelled' })
    await hub.stop()
  })

  it('is refused without a valid token, and keeps trying', async () => {
    token = 'not-a-token'
    const { hub, statuses } = connect('dispecer@alarmko.test')
    await until(() => statuses.filter((s) => s === 'reconnecting').length >= 2)
    expect(openConnections()).toBe(0)
    // The token is fixed, and the next attempt gets in
    token = await tokenOf('dispecer@alarmko.test')
    await until(() => statuses.includes('connected'))
    await hub.stop()
  })

  it('renews the token before it tries again', async () => {
    token = 'expired'
    const beforeRetry = vi.fn(async () => {
      token = await tokenOf('dispecer@alarmko.test')
    })
    const { hub, statuses } = connect('dispecer@alarmko.test', { beforeRetry })
    await until(() => statuses.includes('connected'))
    expect(beforeRetry).toHaveBeenCalled()
    await hub.stop()
  })

  it('keeps trying through an outage and connects when the hub is back', async () => {
    token = await tokenOf('dispecer@alarmko.test')
    const { hub, statuses } = connect('dispecer@alarmko.test')
    await until(() => statuses.includes('connected'))
    dropConnections(300)
    await until(() => statuses.filter((s) => s === 'reconnecting').length >= 2)
    expect(openConnections()).toBe(0)
    await until(() => statuses.filter((s) => s === 'connected').length >= 2)
    expect(openConnections()).toBe(1)
    await hub.stop()
  })

  it('connects again when the server drops it', async () => {
    token = await tokenOf('dispecer@alarmko.test')
    const { hub, statuses } = connect('dispecer@alarmko.test')
    await until(() => statuses.includes('connected'))
    dropConnections()
    await until(() => statuses.filter((s) => s === 'connected').length >= 2)
    expect(openConnections()).toBe(1)
    await hub.stop()
  })

  it('does nothing after it is stopped, even if it was stopped while connecting', async () => {
    token = await tokenOf('dispecer@alarmko.test')
    const { hub, statuses } = connect('dispecer@alarmko.test')
    await hub.stop()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(openConnections()).toBe(0)
    expect(statuses.at(-1)).toBe('disconnected')
  })
})
