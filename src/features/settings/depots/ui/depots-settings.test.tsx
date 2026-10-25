import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listDepots } from '@/entities/depot'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { DepotsSettings } from './depots-settings'

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

function renderDepots() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <DepotsSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis skladišta' })

async function openNew(user: ReturnType<typeof userEvent.setup>) {
  await list()
  await user.click(screen.getByRole('button', { name: 'Dodaj skladište' }))
  return screen.findByRole('dialog', { name: 'Novo skladište' })
}

describe('DepotsSettings', () => {
  it('lists the depots with address and working hours', async () => {
    renderDepots()
    const [depot] = await listDepots()
    const row = within(await list()).getAllByRole('listitem')[0]
    expect(row).toHaveTextContent(depot?.name ?? '')
    expect(row).toHaveTextContent(depot?.address ?? '')
    expect(row).toHaveTextContent(`${depot?.opensAt ?? ''}–${depot?.closesAt ?? ''}`)
  })

  it('adds a depot with coordinates, sent as numbers', async () => {
    let sent: Record<string, unknown> | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/depots')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body
          })
      }
    })
    const user = renderDepots()
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv/), 'Radionica Rijeka')
    await user.type(within(dialog).getByLabelText(/Adresa/), 'Korzo 1, Rijeka')
    await user.type(within(dialog).getByLabelText('Geografska širina'), '45,3271')
    await user.type(within(dialog).getByLabelText('Geografska dužina'), '14.4422')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Skladište je spremljeno.')).toBeInTheDocument()
    expect(await within(await list()).findByText('Radionica Rijeka')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent).toMatchObject({
        name: 'Radionica Rijeka',
        address: 'Korzo 1, Rijeka',
        opensAt: '07:00',
        closesAt: '17:00',
        lat: 45.3271,
        lng: 14.4422,
      })
    })
  })

  it('does not send a depot that is not valid, and says what is wrong', async () => {
    const user = renderDepots()
    const before = (await listDepots()).length
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv/), 'X')
    await user.type(within(dialog).getByLabelText(/Adresa/), 'Y')
    await user.type(within(dialog).getByLabelText('Geografska širina'), '45')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(
      await within(dialog).findByText('Upišite obje koordinate ili nijednu.'),
    ).toBeInTheDocument()
    expect(await listDepots()).toHaveLength(before)
  })

  it('opens a depot with its values and saves a change', async () => {
    const user = renderDepots()
    const [depot] = await listDepots()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${depot?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi skladište' })
    expect(within(dialog).getByLabelText(/Adresa/)).toHaveValue(depot?.address)
    const closes = within(dialog).getByLabelText(/Radno vrijeme do/)
    expect(closes).toHaveValue(depot?.closesAt)
    await user.clear(closes)
    await user.type(closes, '23:30')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Skladište je spremljeno.')
    expect((await listDepots()).find((d) => d.id === depot?.id)?.closesAt).toBe('23:30')
  })

  it('refuses to delete a depot technicians start from, and says why', async () => {
    const user = renderDepots()
    const [depot] = await listDepots()
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${depot?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati skladište?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši skladište' }))
    expect(await within(dialog).findByText(/Monteri još kreću iz ovog skladišta/)).toBeVisible()
    expect(await listDepots()).toHaveLength(1)
  })

  it('deletes a depot nobody starts from', async () => {
    const user = renderDepots()
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv/), 'Privremeno')
    await user.type(within(dialog).getByLabelText(/Adresa/), 'Negdje 1')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await within(await list()).findByText('Privremeno')

    await user.click(screen.getByRole('button', { name: 'Obriši: Privremeno' }))
    const confirm = await screen.findByRole('dialog', { name: 'Obrisati skladište?' })
    await user.click(within(confirm).getByRole('button', { name: 'Obriši skladište' }))
    await waitFor(() => {
      expect(screen.queryByText('Privremeno')).not.toBeInTheDocument()
    })
    expect((await listDepots()).map((d) => d.name)).not.toContain('Privremeno')
  })

  it('says so when the depots cannot be loaded', async () => {
    server.use(
      http.get(`${API}/depots`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderDepots()
    expect(await screen.findByText('Skladišta nije moguće učitati.')).toBeInTheDocument()
  })
})
