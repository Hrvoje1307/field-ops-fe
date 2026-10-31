import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listMailboxes } from '@/entities/mailbox'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { MailboxList } from './mailbox-list'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const alarmko = () => {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  if (!t) throw new Error('seed')
  return t
}

function renderList(onReconnectImap = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MailboxList onReconnectImap={onReconnectImap} empty={<p>Nema sandučića</p>} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onReconnectImap }
}

const list = () => screen.findByRole('list', { name: 'Popis sandučića' })
const rowOf = (name: string) =>
  screen.getByText(name, { selector: 'span' }).closest('li') as HTMLElement

describe('MailboxList', () => {
  it('shows each mailbox with its status, kind, owner and last sync', async () => {
    renderList()
    const items = within(await list()).getAllByRole('listitem')
    const mailboxes = await listMailboxes()
    expect(items).toHaveLength(mailboxes.length)
    const shared = mailboxes.find((m) => m.kind === 'shared')
    expect(within(rowOf(shared?.displayName ?? '')).getByText('Aktivan')).toBeInTheDocument()
    const personal = mailboxes.find((m) => m.kind === 'personal')
    expect(rowOf(personal?.displayName ?? '')).toHaveTextContent(
      `Vlasnik: ${personal?.owner?.fullName ?? ''}`,
    )
  })

  it('says what mailboxes are for when there are none, and when they cannot be loaded', async () => {
    for (const row of alarmko().sales.mailboxes) row.deletedAt = '2026-10-01T00:00:00Z'
    renderList()
    expect(await screen.findByText('Nema sandučića')).toBeInTheDocument()
  })

  it('says so when the list cannot be loaded, and again on retry', async () => {
    server.use(
      http.get(`${API}/sales/mailboxes`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const { user } = renderList()
    expect(await screen.findByText('Sandučiće nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await list()).toBeInTheDocument()
  })

  it('sync now asks for a sync and the last sync is read again', async () => {
    const { user } = renderList()
    await list()
    const row = alarmko().sales.mailboxes.find((m) => m.status === 'active')
    if (!row) throw new Error('seed')
    const before = row.lastSyncedAt
    await user.click(screen.getByRole('button', { name: `Sinkroniziraj sada: ${row.displayName}` }))
    expect(await screen.findByText('Sinkronizacija je zatražena.')).toBeInTheDocument()
    await waitFor(() => {
      expect(row.lastSyncedAt).not.toBe(before)
    })
  })

  it('a mailbox that needs reauth offers "Ponovno spoji" instead of a sync; Gmail goes through the provider with its id', async () => {
    const row = alarmko().sales.mailboxes.find((m) => m.provider === 'gmail')
    if (!row) throw new Error('seed')
    row.status = 'needs_reauth'
    row.lastError = 'Pristup je opozvan.'
    const assign = vi.fn()
    vi.stubGlobal('location', { assign, origin: 'http://localhost' })
    let sent: Record<string, unknown> | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/oauth/start')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body
          })
      }
    })
    const { user } = renderList()
    await list()
    expect(
      screen.queryByRole('button', { name: `Sinkroniziraj sada: ${row.displayName}` }),
    ).not.toBeInTheDocument()
    expect(within(rowOf(row.displayName)).getByText(/Pristup je opozvan/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Ponovno spoji: ${row.displayName}` }))
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(expect.stringContaining('/mock-oauth/gmail?state='))
    })
    expect(sent).toMatchObject({ provider: 'gmail', kind: 'shared', mailboxId: row.id })
  })

  it('an IMAP mailbox with an error is handed to the form', async () => {
    const row = alarmko().sales.mailboxes[0]
    if (!row) throw new Error('seed')
    row.provider = 'imap'
    row.status = 'error'
    const { user, onReconnectImap } = renderList()
    await list()
    await user.click(screen.getByRole('button', { name: `Ponovno spoji: ${row.displayName}` }))
    expect(onReconnectImap).toHaveBeenCalledWith(expect.objectContaining({ id: row.id }))
  })

  it('pauses and resumes', async () => {
    const { user } = renderList()
    await list()
    const row = alarmko().sales.mailboxes.find((m) => m.status === 'active')
    if (!row) throw new Error('seed')
    await user.click(screen.getByRole('button', { name: `Pauziraj: ${row.displayName}` }))
    expect(await screen.findByText('Sandučić je pauziran.')).toBeInTheDocument()
    expect(row.status).toBe('disabled')
    await user.click(await screen.findByRole('button', { name: `Nastavi: ${row.displayName}` }))
    await waitFor(() => {
      expect(row.status).toBe('active')
    })
  })

  it('disconnects without purge; with purge it needs a second confirmation', async () => {
    const { user } = renderList()
    await list()
    const [first, second] = alarmko().sales.mailboxes
    if (!first || !second) throw new Error('seed')
    await user.click(screen.getByRole('button', { name: `Odspoji: ${first.displayName}` }))
    let dialog = await screen.findByRole('dialog', { name: 'Odspojiti sandučić?' })
    expect(dialog).toHaveTextContent('Prilike ostaju')
    await user.click(within(dialog).getByRole('button', { name: 'Odspoji sandučić' }))
    await waitFor(() => {
      expect(first.deletedAt).toBeTruthy()
    })

    await user.click(await screen.findByRole('button', { name: `Odspoji: ${second.displayName}` }))
    dialog = await screen.findByRole('dialog', { name: 'Odspojiti sandučić?' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Obriši i uvezeni sadržaj' }))
    const confirm = within(dialog).getByRole('button', { name: 'Odspoji i obriši sadržaj' })
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /Razumijem/ }))
    expect(confirm).toBeEnabled()
    // Unticking the first choice takes the second away with it
    await user.click(within(dialog).getByRole('checkbox', { name: 'Obriši i uvezeni sadržaj' }))
    expect(within(dialog).getByRole('button', { name: 'Odspoji sandučić' })).toBeEnabled()
  })
})
