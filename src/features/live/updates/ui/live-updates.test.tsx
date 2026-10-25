import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { authKeys, getMe, login, sessionStore } from '@/entities/auth'
import { channel, type LiveEvent } from '@/entities/realtime'
import { resetMockDb } from '@/shared/api/mocks/db'
import { configureSessionStore } from '@/shared/api/session-port'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { DEFAULT_TENANT_FORMAT } from '@/shared/lib/tenant-format'
import { Toaster } from '@/shared/ui/sonner'

import { LiveUpdates, NOTICE_THROTTLE_MS } from './live-updates'

async function signInAs(email: string) {
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email, password: 'demo' }))
}

beforeEach(() => {
  resetMockDb()
  channel.setStatus('connected')
})

afterEach(() => {
  toast.dismiss()
  channel.setStatus('disconnected')
})

async function renderLive(email: string, downNoticeDelay?: number) {
  await signInAs(email)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The route guard has loaded the user before any screen renders
  await queryClient.query({ queryKey: authKeys.me, queryFn: ({ signal }) => getMe(signal) })
  render(
    <QueryClientProvider client={queryClient}>
      <TenantFormatProvider settings={DEFAULT_TENANT_FORMAT}>
        <Suspense fallback={null}>
          <LiveUpdates downNoticeDelay={downNoticeDelay} />
        </Suspense>
        <Toaster />
      </TenantFormatProvider>
    </QueryClientProvider>,
  )
}

const updated = (own = false): LiveEvent => ({
  type: 'JobUpdated',
  payload: { jobId: 'a', scheduledDate: '2026-10-16' },
  own,
})

describe('the connection notice', () => {
  it('says nothing while updates are up', async () => {
    await renderLive('petra@alarmko.test', 50)
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(screen.queryByTestId('live-down')).not.toBeInTheDocument()
  })

  it('says so once updates have been down for a while, and stops saying so when they are back', async () => {
    await renderLive('vlasnik@alarmko.test', 80)
    act(() => {
      channel.setStatus('reconnecting')
    })
    // Not at once: a short break is no news
    expect(screen.queryByTestId('live-down')).not.toBeInTheDocument()
    expect(await screen.findByTestId('live-down')).toHaveTextContent(
      /Osvježavanje u stvarnom vremenu je prekinuto/,
    )
    act(() => {
      channel.setStatus('connected')
    })
    await waitFor(() => {
      expect(screen.queryByTestId('live-down')).not.toBeInTheDocument()
    })
  })

  it('a short break that mends in time is never mentioned', async () => {
    await renderLive('vlasnik@alarmko.test', 150)
    act(() => {
      channel.setStatus('reconnecting')
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    act(() => {
      channel.setStatus('connected')
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(screen.queryByTestId('live-down')).not.toBeInTheDocument()
  })
})

describe('schedule notices', () => {
  it('a technician is told when someone else changes the schedule', async () => {
    await renderLive('petra@alarmko.test')
    act(() => {
      channel.publish(updated())
    })
    expect(await screen.findByText('Raspored je promijenjen.')).toBeInTheDocument()
  })

  it('and when a plan is published, naming its day', async () => {
    await renderLive('petra@alarmko.test')
    act(() => {
      channel.publish({
        type: 'RoutePlanPublished',
        payload: { routePlanId: 'p', date: '2026-10-16' },
        own: false,
      })
    })
    expect(await screen.findByText(/Objavljen je plan za .*16/)).toBeInTheDocument()
  })

  it('not about what they did themselves', async () => {
    await renderLive('petra@alarmko.test')
    act(() => {
      channel.publish(updated(true))
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.queryByText('Raspored je promijenjen.')).not.toBeInTheDocument()
  })

  it('one notice for a burst of changes', async () => {
    await renderLive('petra@alarmko.test')
    act(() => {
      channel.publish(updated())
      channel.publish(updated())
      channel.publish(updated())
    })
    await screen.findByText('Raspored je promijenjen.')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.getAllByText('Raspored je promijenjen.')).toHaveLength(1)
    expect(NOTICE_THROTTLE_MS).toBeGreaterThan(0)
  })

  it('the office is not interrupted: its screens update by themselves', async () => {
    await renderLive('vlasnik@alarmko.test')
    act(() => {
      channel.publish(updated())
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.queryByText('Raspored je promijenjen.')).not.toBeInTheDocument()
  })
})
