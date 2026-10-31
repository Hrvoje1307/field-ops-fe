import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMe, login, sessionStore } from '@/entities/auth'
import { listMailThreads } from '@/entities/mail-thread'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { MailInbox } from './mail-inbox'
import { inboxSearchSchema, type InboxSearch } from '../model/search'

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

async function renderInbox(search: Partial<InboxSearch> = {}, onSearchChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <MailInbox search={inboxSearchSchema.parse(search)} onSearchChange={onSearchChange} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onSearchChange }
}

describe('MailInbox', () => {
  it('lists what the API returns for the card, and opening one is reported', async () => {
    const { user, onSearchChange } = await renderInbox()
    const expected = await listMailThreads({ isSales: true, pageSize: 30 })
    const rows = await screen.findAllByTestId('thread-row')
    expect(rows).toHaveLength(expected.items.length)
    const [first] = rows
    if (!first) throw new Error('no rows')
    await user.click(first)
    expect(onSearchChange).toHaveBeenCalledWith({ thread: expected.items[0]?.id })
  })

  it('with the AI: the review and "not sales" cards and the category of each conversation', async () => {
    await renderInbox()
    expect(await screen.findByRole('tab', { name: 'Za pregled' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Nije prodaja' })).toBeInTheDocument()
    expect((await screen.findAllByText('Novi upit')).length).toBeGreaterThan(0)
  })

  it('without `sales_ai`: no review card, no category, the rest works', async () => {
    const me = await fetchMe(new QueryClient())
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
      ),
    )
    await renderInbox()
    expect(await screen.findAllByTestId('thread-row')).not.toHaveLength(0)
    expect(screen.queryByRole('tab', { name: 'Za pregled' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Nije prodaja' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Čeka odgovor' })).toBeInTheDocument()
    expect(screen.queryByText('Novi upit')).not.toBeInTheDocument()
    expect(screen.queryByText('Za pregled')).not.toBeInTheDocument()
  })

  it('an empty card says so', async () => {
    server.use(
      http.get(`${API}/sales/threads`, () =>
        HttpResponse.json({ items: [], page: 1, pageSize: 30, totalCount: 0 }),
      ),
    )
    await renderInbox()
    expect(await screen.findByText('Nema razgovora u ovom prikazu.')).toBeInTheDocument()
  })

  it('a search without hits says so and offers to clear the filters', async () => {
    server.use(
      http.get(`${API}/sales/threads`, () =>
        HttpResponse.json({ items: [], page: 1, pageSize: 30, totalCount: 0 }),
      ),
    )
    const { user, onSearchChange } = await renderInbox({ q: 'nešto' })
    expect(await screen.findByText('Nijedan razgovor ne odgovara pretrazi.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Očisti filtere' }))
    expect(onSearchChange).toHaveBeenCalledWith({ q: undefined, mailbox: undefined, page: 1 })
  })

  it('a failed load says so, and loads again on retry', async () => {
    server.use(
      http.get(`${API}/sales/threads`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const { user } = await renderInbox()
    expect(await screen.findByText('Razgovore nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await screen.findAllByTestId('thread-row')).not.toHaveLength(0)
  })
})
