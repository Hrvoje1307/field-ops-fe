import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listChecklistTemplates } from '@/entities/checklist-template'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { ChecklistsSettings } from './checklists-settings'

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
})

function renderChecklists() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ChecklistsSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis kontrolnih lista' })

async function openNew(user: ReturnType<typeof userEvent.setup>) {
  await list()
  await user.click(screen.getByRole('button', { name: 'Dodaj kontrolnu listu' }))
  return screen.findByRole('dialog', { name: 'Nova kontrolna lista' })
}

describe('ChecklistsSettings', () => {
  it('lists the templates with their number of items', async () => {
    renderChecklists()
    const templates = await listChecklistTemplates()
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(templates.length)
    const first = templates[0]
    expect(rows[0]).toHaveTextContent(first?.name ?? '')
    expect(rows[0]).toHaveTextContent(String(first?.items.length))
  })

  it('adds a template with items in the order they were given', async () => {
    let sent: { name: string; items: { label: string; required: boolean }[] } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/checklist-templates')) {
        void request
          .clone()
          .json()
          .then((body: typeof sent) => {
            sent = body
          })
      }
    })
    const user = renderChecklists()
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/^Naziv/), 'Obilazak')
    await user.type(within(dialog).getByLabelText('Stavka 1'), 'Provjeriti napajanje')
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj stavku' }))
    await user.type(within(dialog).getByLabelText('Stavka 2'), 'Fotografirati uređaj')
    const second = within(dialog).getAllByLabelText('Obavezna')[1]
    if (!second) throw new Error('Expected a second item')
    await user.click(second)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Kontrolna lista je spremljena.')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent).toEqual({
        name: 'Obilazak',
        items: [
          { label: 'Provjeriti napajanje', required: false },
          { label: 'Fotografirati uređaj', required: true },
        ],
      })
    })
    expect(await within(await list()).findByText('Obilazak')).toBeInTheDocument()
  })

  it('moves and removes items', async () => {
    const user = renderChecklists()
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/^Naziv/), 'Redoslijed')
    await user.type(within(dialog).getByLabelText('Stavka 1'), 'Prva')
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj stavku' }))
    await user.type(within(dialog).getByLabelText('Stavka 2'), 'Druga')
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj stavku' }))
    await user.type(within(dialog).getByLabelText('Stavka 3'), 'Treća')

    // The ends cannot move out
    expect(within(dialog).getByRole('button', { name: 'Pomakni stavku 1 gore' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Pomakni stavku 3 dolje' })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Pomakni stavku 3 gore' }))
    expect(within(dialog).getByLabelText('Stavka 2')).toHaveValue('Treća')
    expect(within(dialog).getByLabelText('Stavka 3')).toHaveValue('Druga')

    await user.click(within(dialog).getByRole('button', { name: 'Ukloni stavku 1' }))
    expect(within(dialog).getByLabelText('Stavka 1')).toHaveValue('Treća')
    expect(within(dialog).getByLabelText('Stavka 2')).toHaveValue('Druga')
    expect(within(dialog).queryByLabelText('Stavka 3')).not.toBeInTheDocument()
  })

  it('needs a name, a label on every item, and at least one item', async () => {
    const user = renderChecklists()
    const before = (await listChecklistTemplates()).length
    const dialog = await openNew(user)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Upišite naziv kontrolne liste.')).toBeInTheDocument()
    expect(within(dialog).getByText('Upišite što treba provjeriti.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Ukloni stavku 1' }))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Dodajte barem jednu stavku.')).toBeInTheDocument()
    expect(await listChecklistTemplates()).toHaveLength(before)
  })

  it('opens a template with its items, and saves a change', async () => {
    const user = renderChecklists()
    const [template] = await listChecklistTemplates()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${template?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi kontrolnu listu' })
    expect(within(dialog).getByLabelText('Stavka 1')).toHaveValue(template?.items[0]?.label)
    expect(within(dialog).getAllByLabelText('Obavezna')).toHaveLength(template?.items.length ?? 0)
    await user.click(within(dialog).getByRole('button', { name: 'Ukloni stavku 1' }))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Kontrolna lista je spremljena.')
    const saved = (await listChecklistTemplates()).find((t) => t.id === template?.id)
    expect(saved?.items).toHaveLength((template?.items.length ?? 0) - 1)
  })

  it('asks before deleting, and deletes', async () => {
    const user = renderChecklists()
    const templates = await listChecklistTemplates()
    const target = templates[0]
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${target?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati kontrolnu listu?' })
    expect(await listChecklistTemplates()).toHaveLength(templates.length)
    await user.click(within(dialog).getByRole('button', { name: 'Obriši listu' }))
    await waitFor(async () => {
      expect(await listChecklistTemplates()).toHaveLength(templates.length - 1)
    })
  })

  it('says so when the templates cannot be loaded', async () => {
    server.use(
      http.get(`${API}/checklist-templates`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderChecklists()
    expect(await screen.findByText('Kontrolne liste nije moguće učitati.')).toBeInTheDocument()
  })
})
