import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listMessages } from '@/entities/message'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { type MessagesSearch } from '../model/search'
import { MessageList } from './message-list'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
})

function Harness({ initial }: { initial?: Partial<MessagesSearch> }) {
  const [search, setSearch] = useState<MessagesSearch>({ status: 'all', page: 1, ...initial })
  return (
    <MessageList
      search={search}
      onSearchChange={(patch) => {
        setSearch((current) => ({ ...current, ...patch }))
      }}
    />
  )
}

async function renderList(initial?: Partial<MessagesSearch>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(<Harness initial={initial} />, {
    wrap: (children) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  })
  return userEvent.setup()
}

describe('the list of all messages', () => {
  it('shows every message, newest first, with how it ended and the reason when it did not', async () => {
    await renderList()
    const all = await listMessages({})
    const rows = await screen.findAllByTestId('message-row')
    expect(rows).toHaveLength(all.items.length)
    expect(rows[0]).toHaveTextContent(all.items[0]?.to ?? '')
    const failed = rows.find((row) => row.textContent.includes('Nije poslano'))
    expect(failed).toHaveTextContent('Broj nije dostupan.')
    const refused = rows.find((row) => row.textContent.includes('Nije dostavljeno'))
    expect(refused).toHaveTextContent('Operator je odbio poruku.')
    expect(screen.getAllByRole('link', { name: 'Otvori nalog' })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/\/jobs\//),
    )
  })

  it('shows only those with the chosen state, and can show all again', async () => {
    const user = await renderList()
    await screen.findAllByTestId('message-row')
    await user.selectOptions(screen.getByLabelText('Stanje'), 'Nije poslano')
    await waitFor(() => {
      const rows = screen.getAllByTestId('message-row')
      expect(rows.every((row) => row.textContent.includes('Nije poslano'))).toBe(true)
    })
    expect(screen.getAllByTestId('message-row').length).toBe(
      (await listMessages({ status: 'failed' })).totalCount,
    )
    const everything = (await listMessages({})).items.length
    await user.selectOptions(screen.getByLabelText('Stanje'), 'Sve poruke')
    await waitFor(() => {
      expect(screen.getAllByTestId('message-row')).toHaveLength(everything)
    })
  })

  it('says when no message has that state, and how to get the rest back', async () => {
    const user = await renderList({ status: 'queued' })
    expect(await screen.findByText('Nema poruka s ovim stanjem.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prikaži sve poruke' }))
    expect((await screen.findAllByTestId('message-row')).length).toBeGreaterThan(0)
  })

  it('pages through them', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const many = Array.from({ length: 120 }, (_, index) => ({
      id: crypto.randomUUID(),
      jobId: null,
      channel: 'sms',
      templateKey: null,
      to: `+38591${String(1000000 + index)}`,
      subject: null,
      body: `Poruka ${String(index)}`,
      status: 'delivered',
      error: null,
      segments: 1,
      cost: '0.05',
      sentAt: null,
      deliveredAt: null,
      createdAt: new Date(Date.now() - index * 60_000).toISOString(),
    }))
    server.use(
      http.get(`${API}/messages`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        return HttpResponse.json({
          page,
          pageSize: 50,
          totalCount: many.length,
          items: many.slice((page - 1) * 50, page * 50),
        })
      }),
    )
    const user = userEvent.setup()
    await renderInRouter(<Harness />, {
      wrap: (children) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })
    expect(await screen.findByTestId('messages-range')).toHaveTextContent('1–50 od 120')
    expect(screen.getByRole('button', { name: 'Prethodna' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Sljedeća' }))
    await waitFor(() => {
      expect(screen.getByTestId('messages-range')).toHaveTextContent('51–100 od 120')
    })
    await user.click(screen.getByRole('button', { name: 'Sljedeća' }))
    await waitFor(() => {
      expect(screen.getByTestId('messages-range')).toHaveTextContent('101–120 od 120')
    })
    expect(screen.getByRole('button', { name: 'Sljedeća' })).toBeDisabled()
    expect(
      within(screen.getByRole('navigation', { name: 'Stranice poruka' })).getByText(/od 120/),
    ).toBeVisible()
  })

  it('says when there are none and when they cannot be loaded', async () => {
    server.use(
      http.get(`${API}/messages`, () =>
        HttpResponse.json({ page: 1, pageSize: 50, totalCount: 0, items: [] }),
      ),
    )
    await renderList()
    expect(await screen.findByText('Još nema poslanih poruka.')).toBeInTheDocument()
  })

  it('says so when the messages cannot be loaded', async () => {
    server.use(
      http.get(`${API}/messages`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    await renderList()
    expect(await screen.findByText('Poruke nije moguće učitati.')).toBeInTheDocument()
  })
})
