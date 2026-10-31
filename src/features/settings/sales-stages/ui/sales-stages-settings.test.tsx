import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listSalesStages } from '@/entities/sales-stage'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { SalesStagesSettings } from './sales-stages-settings'

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

function renderStages() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SalesStagesSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis faza' })
const names = async () => (await listSalesStages({ includeInactive: true })).map((s) => s.name)

describe('SalesStagesSettings', () => {
  it('lists the stages in the API order with their own names, colours and days', async () => {
    renderStages()
    const stages = await listSalesStages({ includeInactive: true })
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual(
      stages.map((s) => s.name),
    )
    const first = stages[0]
    expect(rows[0]?.querySelector('[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: first?.color ?? '',
    })
    const offer = stages.find((s) => s.followUpDays)
    expect(
      within(list_row(rows, offer?.name ?? '')).getByText(/Praćenje \d+ d/),
    ).toBeInTheDocument()
  })

  it('adds a stage; the new one starts in the colour of the open stage before it', async () => {
    const user = renderStages()
    await list()
    const stages = await listSalesStages({ includeInactive: true })
    const lastOpen = stages.findLast((s) => s.kind === 'open')
    await user.click(screen.getByRole('button', { name: 'Dodaj fazu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova faza' })
    expect(within(dialog).getByRole('textbox', { name: 'Boja' })).toHaveValue(lastOpen?.color ?? '')
    await user.type(within(dialog).getByLabelText(/Naziv/), 'Dogovoren obilazak')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Faza je spremljena.')).toBeInTheDocument()
    await waitFor(async () => {
      expect(await names()).toContain('Dogovoren obilazak')
    })
  })

  it('does not send a stage without a colour in #rrggbb', async () => {
    const user = renderStages()
    await list()
    const before = (await names()).length
    await user.click(screen.getByRole('button', { name: 'Dodaj fazu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova faza' })
    const colour = within(dialog).getByRole('textbox', { name: 'Boja' })
    await user.clear(colour)
    await user.type(within(dialog).getByLabelText(/Naziv/), 'Bez boje')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Boja mora biti u obliku #rrggbb.')).toBeVisible()
    expect(await names()).toHaveLength(before)
  })

  it('an inactive stage is explained in the form and in the list', async () => {
    const user = renderStages()
    await list()
    const [first] = await listSalesStages({ includeInactive: true })
    await user.click(screen.getByRole('button', { name: `Uredi: ${first?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi fazu' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Faza je aktivna' }))
    expect(within(dialog).getByText(/Prilike ostaju u fazi dok ih ne premjestite/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Faza je spremljena.')
    const row = list_row(within(await list()).getAllByRole('listitem'), first?.name ?? '')
    expect(within(row).getByText('Neaktivna')).toBeInTheDocument()
    expect(within(row).getByText(/Prilike ostaju u fazi dok ih ne premjestite/)).toBeInTheDocument()
  })

  it('refuses to delete a stage that still has deals, and says why', async () => {
    const user = renderStages()
    await list()
    const [first] = await listSalesStages({ includeInactive: true })
    await user.click(screen.getByRole('button', { name: `Obriši: ${first?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati fazu?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši fazu' }))
    expect(await within(dialog).findByText(/U ovoj fazi još ima prilika/)).toBeVisible()
    expect(await names()).toContain(first?.name)
  })

  it('says it when the only won stage would be switched off (409 sales.stage_required)', async () => {
    const user = renderStages()
    await list()
    const won = (await listSalesStages({ includeInactive: true })).find((s) => s.kind === 'won')
    await user.click(screen.getByRole('button', { name: `Uredi: ${won?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi fazu' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Faza je aktivna' }))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText(/Potrebna je točno jedna aktivna faza/)).toBeVisible()
    expect(
      (await listSalesStages({ includeInactive: true })).find((s) => s.id === won?.id)?.isActive,
    ).toBe(true)
  })

  it('moves a stage up and keeps the order the API answers with', async () => {
    const user = renderStages()
    await list()
    const before = await names()
    await user.click(screen.getByRole('button', { name: `Pomakni gore: ${before[1] ?? ''}` }))
    await waitFor(async () => {
      expect((await names()).slice(0, 2)).toEqual([before[1], before[0]])
    })
    const rows = within(await list()).getAllByRole('listitem')
    await waitFor(() => {
      expect(rows[0]?.querySelector('p')?.textContent).toBe(before[1])
    })
  })

  it('says so when the stages cannot be loaded', async () => {
    server.use(
      http.get(`${API}/sales/stages`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderStages()
    expect(await screen.findByText('Faze nije moguće učitati.')).toBeInTheDocument()
  })
})

function list_row(rows: HTMLElement[], name: string): HTMLElement {
  const row = rows.find((candidate) => candidate.querySelector('p')?.textContent.startsWith(name))
  if (!row) throw new Error(`No row for ${name}`)
  return row
}
