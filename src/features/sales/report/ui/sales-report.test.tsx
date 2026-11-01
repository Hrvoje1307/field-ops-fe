import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SalesReport } from '@/shared/api/generated/model'
import { server } from '@/shared/api/mocks/node'
import { renderScreen, signInAs } from '@/shared/api/test/screen-test-utils'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { SalesReportView } from './sales-report'

const API = 'http://localhost/api/v1'

const report = (patch: Partial<SalesReport> = {}): SalesReport => ({
  from: '2026-10-01',
  to: '2026-10-31',
  dealsCreated: 12,
  dealsWon: 3,
  dealsLost: 1,
  winRate: 0.75,
  openValue: '15400.50',
  wonValue: '3200.00',
  medianFirstResponseMinutes: 135,
  stageTimes: [
    { stageId: 'a', name: 'Ponuda poslana', avgDays: 3.5 },
    { stageId: 'b', name: 'Pregovori', avgDays: 0 },
  ],
  lostReasons: [{ reason: 'price', count: 1 }],
  bySource: [
    { source: 'email', created: 8, won: 2 },
    { source: 'phone', created: 4, won: 1 },
  ],
  ...patch,
})

const requests: URL[] = []

beforeEach(async () => {
  await signInAs()
  requests.length = 0
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes('/sales/reports/summary')) requests.push(new URL(request.url))
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

const serve = (data: SalesReport) => {
  server.use(http.get(`${API}/sales/reports/summary`, () => HttpResponse.json(data)))
}
const figure = (key: string) => screen.findByTestId(`figure-${key}`)

describe('SalesReportView', () => {
  it('writes out the figures of the API: counts, a percent, money as given, hours and minutes', async () => {
    serve(report())
    renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    expect(await figure('created')).toHaveTextContent('12')
    expect(await figure('won')).toHaveTextContent('3')
    expect(await figure('lost')).toHaveTextContent('1')
    expect(await figure('winRate')).toHaveTextContent('75 %')
    expect(await figure('openValue')).toHaveTextContent('15.400,50')
    expect(await figure('wonValue')).toHaveTextContent('3.200,00')
    expect(await figure('response')).toHaveTextContent('2 h 15 min')
  })

  it('says "no closed" when there is no win rate, and "not entered" for a missing value', async () => {
    serve(
      report({
        dealsWon: 0,
        dealsLost: 0,
        winRate: null,
        openValue: null,
        wonValue: null,
        medianFirstResponseMinutes: null,
      }),
    )
    renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    expect(await figure('winRate')).toHaveTextContent('Nema zatvorenih')
    expect(await figure('openValue')).toHaveTextContent('Nije upisano')
    expect(await figure('wonValue')).toHaveTextContent('Nije upisano')
    expect(await figure('response')).toHaveTextContent('Nema podataka')
  })

  it('draws the three lists: stage names from the API, enum labels from the texts, the won part of the created', async () => {
    serve(report())
    renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    const stages = await screen.findByRole('list', { name: 'Prosječno zadržavanje u fazi' })
    expect(within(stages).getByText('Ponuda poslana')).toBeInTheDocument()
    expect(within(stages).getByText('3,5 dana')).toBeInTheDocument()
    const reasons = screen.getByRole('list', { name: 'Razlozi gubitka' })
    expect(within(reasons).getByText('Cijena')).toBeInTheDocument()
    const sources = screen.getByRole('list', { name: 'Izvori prilika' })
    expect(within(sources).getByText('Email')).toBeInTheDocument()
    expect(within(sources).getByText('nove 8, dobivene 2')).toBeInTheDocument()
  })

  it('asks for this month in the tenant zone until the address says otherwise', async () => {
    serve(report())
    renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    await figure('created')
    const today = todayInTimeZone('Europe/Zagreb')
    expect(requests[0]?.searchParams.get('from')).toBe(`${today.slice(0, 8)}01`)
    expect(requests[0]?.searchParams.get('to')).toBe(today)
    expect(screen.getByRole('button', { name: 'Ovaj mjesec' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('asks for the period of the address', async () => {
    serve(report())
    renderScreen(
      <SalesReportView
        search={{ from: '2026-09-01', to: '2026-09-30' }}
        onSearchChange={vi.fn()}
      />,
    )
    await figure('created')
    expect(requests[0]?.searchParams.get('from')).toBe('2026-09-01')
    expect(requests[0]?.searchParams.get('to')).toBe('2026-09-30')
    expect(screen.getByLabelText('Od')).toHaveValue('2026-09-01')
    for (const name of ['Ovaj mjesec', 'Prošli mjesec', 'Zadnjih 90 dana']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('a ready-made period goes to the address as dates', async () => {
    serve(report())
    const change = vi.fn()
    const user = renderScreen(<SalesReportView search={{}} onSearchChange={change} />)
    await figure('created')
    await user.click(screen.getByRole('button', { name: 'Zadnjih 90 dana' }))
    const today = todayInTimeZone('Europe/Zagreb')
    const call = change.mock.calls[0]?.[0] as { from: string; to: string }
    expect(call.to).toBe(today)
    expect(call.from < call.to).toBe(true)
  })

  it('a typed period goes to the address; a reversed one is refused with a message, not sent', async () => {
    serve(report())
    const change = vi.fn()
    renderScreen(
      <SalesReportView search={{ from: '2026-09-01', to: '2026-09-30' }} onSearchChange={change} />,
    )
    await figure('created')
    fireEvent.change(screen.getByLabelText('Do'), { target: { value: '2026-10-15' } })
    expect(change).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-10-15' })
    change.mockClear()
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2026-11-01' } })
    expect(
      await screen.findByText('Datum "Od" ne smije biti nakon datuma "Do".'),
    ).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('the owner can look at one person and the request carries that person', async () => {
    serve(report())
    const change = vi.fn()
    const user = renderScreen(<SalesReportView search={{}} onSearchChange={change} />)
    const select = await screen.findByLabelText('Prikaz za')
    await waitFor(() => {
      expect(within(select).getAllByRole('option').length).toBeGreaterThan(1)
    })
    const person = within(select).getAllByRole('option')[1] as HTMLOptionElement
    await user.selectOptions(select, person.value)
    expect(change).toHaveBeenCalledWith({ owner: person.value })
  })

  it('a person of the address is sent to the API', async () => {
    serve(report())
    renderScreen(<SalesReportView search={{ owner: 'u-1' }} onSearchChange={vi.fn()} />)
    await figure('created')
    expect(requests[0]?.searchParams.get('ownerUserId')).toBe('u-1')
  })

  it('a dispatcher has no person picker and never sends one, even if the address has it', async () => {
    await signInAs('dispecer@alarmko.test')
    serve(report())
    renderScreen(<SalesReportView search={{ owner: 'u-1' }} onSearchChange={vi.fn()} />)
    await figure('created')
    expect(screen.queryByLabelText('Prikaz za')).not.toBeInTheDocument()
    expect(requests[0]?.searchParams.has('ownerUserId')).toBe(false)
  })

  it('says so when the period has no deals', async () => {
    serve(report({ dealsCreated: 0, dealsWon: 0, dealsLost: 0, winRate: null, lostReasons: [] }))
    renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    expect(await screen.findByText('Nema podataka za ovo razdoblje')).toBeInTheDocument()
  })

  it('says so when it cannot be loaded, and loads again on retry', async () => {
    server.use(
      http.get(`${API}/sales/reports/summary`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = renderScreen(<SalesReportView search={{}} onSearchChange={vi.fn()} />)
    expect(await screen.findByText('Izvještaj nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await figure('created')).toBeInTheDocument()
  })

  it('the figures of the mock are shown as it gives them (the real report, no stand-in)', async () => {
    renderScreen(
      <SalesReportView
        search={{ from: '2020-01-01', to: '2030-12-31' }}
        onSearchChange={vi.fn()}
      />,
    )
    const created = await figure('created')
    expect(created).toHaveTextContent(/\d/)
    expect(screen.getByRole('list', { name: 'Izvori prilika' })).toBeInTheDocument()
  })
})
