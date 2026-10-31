import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getDeal } from '@/entities/deal'
import { listClients } from '@/entities/client'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { Toaster } from '@/shared/ui/sonner'

import { ConvertDealSheet } from './convert-deal-sheet'

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

const alarmko = () => {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  if (!t) throw new Error('seed')
  return t
}
const dealWithoutClient = () => {
  const deal = alarmko().sales.deals.find((d) => !d.clientId && !d.jobId)
  if (!deal) throw new Error('seed: a deal without a client')
  return deal
}
const dealWithClient = () => {
  const deal = alarmko().sales.deals.find((d) => d.clientId && !d.jobId)
  if (!deal) throw new Error('seed: a deal with a client')
  return deal
}

async function renderSheet(dealId: string, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <ConvertDealSheet dealId={dealId} onClose={onClose} />
      <Toaster />
    </QueryClientProvider>,
  )
  // The sheet is first the loading one; the ready form is another element
  await screen.findByLabelText(/Vrsta naloga/)
  const dialog = screen.getByRole('dialog', { name: 'Pretvori u nalog' })
  return { dialog, user: userEvent.setup(), onClose }
}

/** The client's locations load after the form opens; the first one is the client's own. */
async function chooseLocation(dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  const section = within(dialog).getByRole('region', { name: 'Lokacija' })
  const [first] = await within(section).findAllByRole('radio')
  if (first) await user.click(first)
}

const firstJobType = (dialog: HTMLElement) =>
  within(dialog)
    .getByLabelText(/Vrsta naloga/)
    .querySelector('option:not([value=""])')?.textContent ?? ''

describe('ConvertDealSheet', () => {
  it('a deal with a client starts with that client chosen, the title as the job title and the version sent', async () => {
    const deal = dealWithClient()
    const client = alarmko().clients.find((c) => c.id === deal.clientId)
    const versionBefore = deal.version
    let sent: Record<string, unknown> | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/convert')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body
          })
      }
    })
    const { dialog, user } = await renderSheet(deal.id)
    expect(await within(dialog).findByText(client?.name ?? '')).toBeVisible()
    expect(within(dialog).getByLabelText(/Naslov/)).toHaveValue(deal.title)
    // The equipment, source, duration and crew size are not part of a conversion
    expect(within(dialog).queryByLabelText(/Trajanje/)).not.toBeInTheDocument()
    await chooseLocation(dialog, user)
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta naloga/), firstJobType(dialog))
    await user.click(within(dialog).getByRole('button', { name: 'Pretvori u nalog' }))
    await waitFor(async () => {
      expect((await getDeal(deal.id)).jobId).toBeTruthy()
    })
    await waitFor(() => {
      expect(sent).toMatchObject({
        clientId: deal.clientId,
        job: { title: deal.title },
        version: versionBefore,
      })
    })
    expect(sent).not.toHaveProperty('newClient')
    expect(sent).not.toHaveProperty('markWon')
    expect(await screen.findByText('Prilika je pretvorena u nalog.')).toBeInTheDocument()
  })

  it('a deal without a client offers matching clients by phone and by email, and chooses none of them', async () => {
    const { clients, contacts } = alarmko()
    const withPhone = contacts.find((c) => c.phone)
    const withEmail = contacts.find((c) => c.email && c.clientId !== withPhone?.clientId)
    const byPhone = clients.find((c) => c.id === withPhone?.clientId)
    const byEmail = clients.find((c) => c.id === withEmail?.clientId)
    const phone = withPhone?.phone
    const email = withEmail?.email
    if (!byPhone || !byEmail || !phone || !email) throw new Error('seed')
    const deal = dealWithoutClient()
    deal.contactPhone = phone
    deal.contactEmail = email
    const { dialog } = await renderSheet(deal.id)
    expect(await within(dialog).findByText('Možda je to postojeći klijent')).toBeVisible()
    expect(
      await within(dialog).findByRole('button', { name: `Odaberi: ${byPhone.name}` }),
    ).toBeVisible()
    expect(
      await within(dialog).findByRole('button', { name: `Odaberi: ${byEmail.name}` }),
    ).toBeVisible()
    // Nothing is chosen for the user: the search and "new client" are still there
    expect(within(dialog).getByRole('button', { name: 'Novi klijent' })).toBeVisible()
    expect(
      within(dialog).queryByRole('button', { name: 'Promijeni klijenta' }),
    ).not.toBeInTheDocument()
  })

  it('a new client starts from what the deal knows; converting creates the client, location and job', async () => {
    const deal = dealWithoutClient()
    deal.extracted = {
      ...deal.extracted,
      street: 'Ulica Test 5',
      city: 'Zagreb',
      request: 'Ugradnja sustava',
    }
    const clientsBefore = (await listClients({ pageSize: 100 })).items.length
    const { dialog, user } = await renderSheet(deal.id)
    await user.click(within(dialog).getByRole('button', { name: 'Novi klijent' }))
    expect(within(dialog).getByLabelText(/Ime i prezime/)).toHaveValue(deal.contactName ?? '')
    expect(within(dialog).getByLabelText(/Ulica i kućni broj/)).toHaveValue('Ulica Test 5')
    expect(within(dialog).getByLabelText(/Mjesto/)).toHaveValue('Zagreb')
    expect(within(dialog).getByLabelText(/Opis/)).toHaveValue('Ugradnja sustava')
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta naloga/), firstJobType(dialog))
    // The tenant's required custom fields of the new client and location
    for (const select of within(dialog).getAllByRole('combobox')) {
      if ((select as HTMLSelectElement).value === '') {
        await user.selectOptions(select, (select as HTMLSelectElement).options[1]?.value ?? '')
      }
    }
    await user.click(within(dialog).getByRole('button', { name: 'Pretvori u nalog' }))
    await waitFor(async () => {
      expect((await getDeal(deal.id)).jobId).toBeTruthy()
    })
    expect((await listClients({ pageSize: 100 })).items.length).toBe(clientsBefore + 1)
    expect((await getDeal(deal.id)).client?.name).toBe(deal.contactName)
  })

  it('shows what is wrong next to the fields and keeps what was typed (400)', async () => {
    const deal = dealWithClient()
    server.use(
      http.post(`${API}/sales/deals/:id/convert`, () =>
        HttpResponse.json(
          { status: 400, title: 'Validation', errors: { 'job.title': ['Naslov je predug.'] } },
          { status: 400 },
        ),
      ),
    )
    const { dialog, user } = await renderSheet(deal.id)
    await chooseLocation(dialog, user)
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta naloga/), firstJobType(dialog))
    await user.click(within(dialog).getByRole('button', { name: 'Pretvori u nalog' }))
    await new Promise((r) => setTimeout(r, 400))
    console.log(
      'ERRS',
      Array.from(document.querySelectorAll('[data-slot="field-error"],[role=alert]')).map(
        (e) => e.textContent,
      ),
    )
    expect(await within(dialog).findByText('Naslov je predug.')).toBeVisible()
    expect(within(dialog).getByLabelText(/Naslov/)).toHaveValue(deal.title)
  })

  it('409 sales.deal_already_converted: says so and closes', async () => {
    const deal = dealWithClient()
    server.use(
      http.post(`${API}/sales/deals/:id/convert`, () =>
        HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'sales.deal_already_converted' },
          { status: 409 },
        ),
      ),
    )
    const { dialog, user, onClose } = await renderSheet(deal.id)
    await chooseLocation(dialog, user)
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta naloga/), firstJobType(dialog))
    await user.click(within(dialog).getByRole('button', { name: 'Pretvori u nalog' }))
    expect(await screen.findByText('Prilika je već pretvorena u nalog.')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('409 on a stale version: the deal is read again, the form stays', async () => {
    const deal = dealWithClient()
    const { dialog, user, onClose } = await renderSheet(deal.id)
    // Someone else changed the deal after the form was opened
    deal.version += 1
    await chooseLocation(dialog, user)
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta naloga/), firstJobType(dialog))
    await user.click(within(dialog).getByRole('button', { name: 'Pretvori u nalog' }))
    expect(
      await screen.findByText(
        'Prilika je u međuvremenu promijenjena. Prikazani su najnoviji podaci.',
      ),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect((await getDeal(deal.id)).jobId ?? null).toBeNull()
  })

  it('says so when what the form needs cannot be loaded', async () => {
    server.use(
      http.get(`${API}/job-types`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await renderInRouter(
      <QueryClientProvider client={queryClient}>
        <ConvertDealSheet dealId={dealWithClient().id} onClose={() => undefined} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Podatke za pretvorbu nije moguće učitati.')).toBeInTheDocument()
  })
})
