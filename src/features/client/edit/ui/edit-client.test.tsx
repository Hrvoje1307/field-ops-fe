import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { type Client, getClient, listClients, toClientBody, updateClient } from '@/entities/client'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { DeleteClientButton, EditClientButton } from './edit-client'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

const API = 'http://localhost/api/v1'
let puts: { version?: number; contacts: unknown[] }[]

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  navigate.mockReset()
  puts = []
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'PUT') return
    void request
      .clone()
      .json()
      .then((body: { version?: number; contacts: unknown[] }) => {
        puts.push(body)
      })
  })
  sessionStore.setTokens(await login({ email: 'dispecer@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

/** The tenant's client with the most open jobs (it has two contacts in the seed). */
async function busyClient(): Promise<Client> {
  const page = await listClients({ pageSize: 200 })
  const summary = [...page.items].sort((a, b) => b.openJobsCount - a.openJobsCount)[0]
  if (!summary) throw new Error('Seed needs clients')
  return getClient(summary.id)
}

function renderButtons(clientId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EditClientButton clientId={clientId} />
      <DeleteClientButton clientId={clientId} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Uredi' }))
  return screen.findByRole('dialog', { name: 'Uredi klijenta' })
}

describe('EditClientButton', () => {
  it('409 after a change elsewhere: keeps what was typed, then saves with the new version', async () => {
    const client = await busyClient()
    const user = renderButtons(client.id)
    await openEditor(user)
    const name = await screen.findByRole('textbox', { name: /^Naziv tvrtke|^Ime i prezime/ })
    await user.clear(name)
    await user.type(name, 'Novo ime d.o.o.')

    // Someone else saves the client meanwhile: our version is stale now
    const fresh = await getClient(client.id)
    await updateClient(
      client.id,
      toClientBody({ ...clientFormLike(fresh), notes: 'Drugi' }, fresh.version),
    )

    await user.click(screen.getByRole('button', { name: 'Spremi klijenta' }))
    expect(
      await screen.findByText(
        'Klijent je u međuvremenu promijenjen. Provjerite podatke i spremite ponovno.',
      ),
    ).toBeInTheDocument()
    expect(name).toHaveValue('Novo ime d.o.o.')

    await user.click(screen.getByRole('button', { name: 'Spremi klijenta' }))
    expect(await screen.findByText('Klijent je spremljen.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    // The UI sent the old version, then the refetched one
    expect(puts.map((put) => put.version)).toEqual([
      fresh.version,
      fresh.version,
      fresh.version + 1,
    ])
    expect((await getClient(client.id)).name).toBe('Novo ime d.o.o.')
  })

  it("a 400 on a contact's phone lands on that contact's input", async () => {
    server.use(
      http.put(`${API}/clients/:id`, () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Validation',
            errors: { 'contacts[1].phone': ['Neispravan broj telefona.'] },
          },
          { status: 400 },
        ),
      ),
    )
    const client = await busyClient()
    const user = renderButtons(client.id)
    await openEditor(user)
    await screen.findAllByRole('textbox', { name: 'Telefon' })
    await user.click(screen.getByRole('button', { name: 'Spremi klijenta' }))

    expect(await screen.findByText('Neispravan broj telefona.')).toBeInTheDocument()
    const phones = screen.getAllByRole('textbox', { name: 'Telefon' })
    expect(phones[1]).toHaveAttribute('aria-invalid', 'true')
    expect(phones[0]).not.toHaveAttribute('aria-invalid')
  })
})

describe('DeleteClientButton', () => {
  it('the API refuses while the client has open jobs: says why, stays on the page', async () => {
    const client = await busyClient()
    const user = renderButtons(client.id)
    await user.click(screen.getByRole('button', { name: 'Obriši' }))
    await user.click(await screen.findByRole('button', { name: 'Obriši klijenta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Klijent ima otvorene naloge i ne može se obrisati.',
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})

/** The stored client as form output (for the "someone else" update). */
function clientFormLike(client: Client) {
  return {
    type: client.type,
    name: client.name,
    oib: client.oib ?? '',
    email: client.email ?? '',
    notes: client.notes ?? '',
    contacts: client.contacts.map((contact) => ({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      isPrimary: contact.isPrimary,
      receivesSms: contact.receivesSms,
    })),
    customFields: client.customFields,
  }
}
