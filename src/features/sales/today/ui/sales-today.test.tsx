import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fetchMe, login, sessionStore } from '@/entities/auth'
import { getSalesToday } from '@/entities/deal'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { SalesTodayView } from './sales-today'

const API = 'http://localhost/api/v1'

async function signIn(email: string) {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email, password: 'demo' }))
}

beforeEach(async () => {
  await signIn('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function renderToday() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <SalesTodayView />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('SalesTodayView', () => {
  it('lists the items in the order the API gives them, each with its reason', async () => {
    await renderToday()
    const today = await getSalesToday({})
    const rows = await screen.findAllByTestId('today-item')
    expect(rows).toHaveLength(today.items.length)
    today.items.forEach((item, index) => {
      expect(rows[index]).toHaveTextContent(item.thread.subject)
    })
    const reasons: Record<string, string> = {
      follow_up_due: 'Praćenje je dospjelo',
      unanswered: 'Klijent čeka odgovor',
      stale: 'Prilika miruje',
    }
    today.items.forEach((item, index) => {
      expect(rows[index]).toHaveTextContent(reasons[item.reason] ?? '')
    })
  })

  it('shows prepared drafts and the review count with the AI', async () => {
    await renderToday()
    const today = await getSalesToday({})
    await screen.findAllByTestId('today-item')
    expect(today.needsReviewCount).toBeGreaterThan(0)
    expect(screen.getByText(`Za pregled: ${String(today.needsReviewCount)}`)).toBeInTheDocument()
    expect(today.items.some((i) => i.draft)).toBe(true)
    expect(screen.getAllByText(/Nacrt je pripremljen|Nacrt se priprema/).length).toBeGreaterThan(0)
  })

  it('without `sales_ai` there are no prepared drafts and no review count', async () => {
    const me = await fetchMe(new QueryClient())
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
      ),
    )
    await renderToday()
    await screen.findAllByTestId('today-item')
    expect(screen.queryByText(/Za pregled:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nacrt je pripremljen/)).not.toBeInTheDocument()
  })

  it('the owner can look at one person’s list; the API is asked for that person', async () => {
    const asked: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/sales/today'))
        asked.push(new URL(request.url).searchParams.get('ownerUserId') ?? '')
    })
    const user = await renderToday()
    const select = await screen.findByLabelText('Prikaz za')
    await waitFor(() => {
      expect(within(select).getAllByRole('option').length).toBeGreaterThan(1)
    })
    const person = within(select).getAllByRole('option')[1] as HTMLOptionElement
    await user.selectOptions(select, person.value)
    await waitFor(() => {
      expect(asked).toContain(person.value)
    })
  })

  it('a dispatcher has no person picker: the API decides whose list it is', async () => {
    await signIn('dispecer@alarmko.test')
    await renderToday()
    await screen.findAllByTestId('today-item')
    expect(screen.queryByLabelText('Prikaz za')).not.toBeInTheDocument()
  })

  it('says so when nothing is due, when stale deals are none, and when it cannot be loaded', async () => {
    server.use(
      http.get(`${API}/sales/today`, () =>
        HttpResponse.json({
          date: '2026-10-28',
          items: [],
          staleDeals: [],
          needsReviewCount: 0,
          mailboxesNeedingAttention: [],
        }),
      ),
    )
    await renderToday()
    expect(await screen.findByText('Danas nema ništa na čekanju.')).toBeInTheDocument()
    expect(screen.getByText('Nijedna prilika ne miruje.')).toBeInTheDocument()
  })

  it('a failed load says so and loads again on retry', async () => {
    server.use(
      http.get(`${API}/sales/today`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = await renderToday()
    expect(await screen.findByText('Popis za danas nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect((await screen.findAllByTestId('today-item')).length).toBeGreaterThan(0)
  })
})
