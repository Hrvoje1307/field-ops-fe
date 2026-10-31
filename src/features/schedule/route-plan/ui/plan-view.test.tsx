import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { optimizeRoutePlan, publishRoutePlan } from '@/entities/dispatch'
import { getDispatchBoard } from '@/entities/dispatch'
import { listTechnicians } from '@/entities/technician'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Toaster } from '@/shared/ui/sonner'
import { fixToday } from '@/shared/lib/test/fixed-today'

import { RoutePlanView } from './plan-view'

const API = 'http://localhost/api/v1'
const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const

/** The next weekday: the seeded technicians work Monday to Friday. */
function workday(): string {
  let date = addDays(todayInTimeZone('Europe/Zagreb'), 1)
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addDays(date, 1)
  return date
}

fixToday()

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'dispecer@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  toast.dismiss()
})

async function draftPlan() {
  const date = workday()
  const [board, technicians] = await Promise.all([
    getDispatchBoard(date),
    listTechnicians({ includeInactive: false }),
  ])
  return optimizeRoutePlan({
    date,
    technicianIds: technicians.map((technician) => technician.id),
    jobIds: board.unassigned
      .filter((job) => job.status === 'new')
      .slice(0, 3)
      .map((job) => job.id),
  })
}

async function renderPlan(planId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(<RoutePlanView planId={planId} />, {
    wrap: (children) => (
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={ZAGREB}>
          {children}
          <Toaster />
        </TenantFormatProvider>
      </QueryClientProvider>
    ),
  })
  return userEvent.setup()
}

describe('RoutePlanView', () => {
  it('shows a draft: status, totals, a column per technician with timed stops, and the unplanned', async () => {
    const plan = await draftPlan()
    await renderPlan(plan.id)
    expect(await screen.findByTestId('plan-status')).toHaveTextContent('Nacrt')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan ruta')
    expect(screen.getByText(/^Sutra, /)).toBeInTheDocument()
    expect(screen.getByText(/^Ukupno:/)).toBeInTheDocument()

    const routes = await screen.findAllByTestId('plan-route')
    expect(routes).toHaveLength(3)
    const stopped = plan.routes.flatMap((route) => route.stops)
    expect(await screen.findAllByTestId('plan-stop')).toHaveLength(
      stopped.length + plan.unassigned.length,
    )
    // Planned stops show arrival and departure in the tenant zone; unplanned ones don't
    const planned = routes.flatMap((route) => within(route).queryAllByTestId('plan-stop'))
    expect(planned).toHaveLength(stopped.length)
    for (const stop of planned) expect(stop).toHaveTextContent(/\d{2}:\d{2}–\d{2}:\d{2}/)
    expect(screen.getByRole('button', { name: 'Objavi plan' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Povuci nalog/ }).length).toBe(
      stopped.length + plan.unassigned.length,
    )
  })

  it('says why the plan left a job out', async () => {
    const plan = await draftPlan()
    // A reason the plan can give
    server.use(
      http.get(`${API}/route-plans/${plan.id}`, () =>
        HttpResponse.json({
          ...plan,
          unassigned: [
            ...plan.unassigned,
            {
              jobId: plan.routes[0]?.stops[0]?.jobId ?? '',
              reason: 'skills',
              detail: 'Nijedan monter nema vještinu: Druga',
            },
          ],
          routes: plan.routes.map((route, index) =>
            index === 0 ? { ...route, stops: route.stops.slice(1) } : route,
          ),
        }),
      ),
    )
    await renderPlan(plan.id)
    const unplaced = await screen.findByTestId('plan-unassigned')
    expect(await within(unplaced).findByText('Vještine')).toBeInTheDocument()
    expect(within(unplaced).getByText(/Nijedan monter nema vještinu: Druga/)).toBeInTheDocument()
  })

  it('publishing asks first, then shows the plan as published and read-only', async () => {
    const plan = await draftPlan()
    const user = await renderPlan(plan.id)
    await user.click(await screen.findByRole('button', { name: 'Objavi plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Objaviti plan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Objavi' }))

    expect(await screen.findByText('Plan je objavljen.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('plan-status')).toHaveTextContent('Objavljen')
    })
    expect(screen.queryByRole('button', { name: 'Objavi plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Povuci nalog/ })).not.toBeInTheDocument()
    expect(screen.getByText('Samo nacrt se može mijenjati.')).toBeInTheDocument()
  })

  it('a published plan cannot be changed or published again', async () => {
    const plan = await draftPlan()
    await publishRoutePlan(plan.id)
    await renderPlan(plan.id)
    expect(await screen.findByTestId('plan-status')).toHaveTextContent('Objavljen')
    expect(screen.queryByRole('button', { name: 'Objavi plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Povuci nalog/ })).not.toBeInTheDocument()
  })

  it('a failed publish says so in the dialog and keeps the draft', async () => {
    const plan = await draftPlan()
    server.use(
      http.post(`${API}/route-plans/:id/publish`, () =>
        HttpResponse.json({ status: 500, title: 'Server error' }, { status: 500 }),
      ),
    )
    const user = await renderPlan(plan.id)
    await user.click(await screen.findByRole('button', { name: 'Objavi plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Objaviti plan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Objavi' }))
    expect(
      await within(dialog).findByText('Plan nije objavljen. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('plan-status')).toHaveTextContent('Nacrt')
  })

  it('409 on publish: closes the dialog and tells the user the plan changed', async () => {
    const plan = await draftPlan()
    server.use(
      http.post(`${API}/route-plans/:id/publish`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const user = await renderPlan(plan.id)
    await user.click(await screen.findByRole('button', { name: 'Objavi plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Objaviti plan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Objavi' }))
    expect(
      await screen.findByText('Plan je u međuvremenu promijenjen. Prikazani su najnoviji podaci.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('a plan that does not exist is not found; a failed load can be retried', async () => {
    await renderPlan('0'.repeat(8) + '-0000-7000-8000-000000000000')
    expect(await screen.findByText('Plan ne postoji.')).toBeInTheDocument()
  })

  it('a load error offers a retry', async () => {
    const plan = await draftPlan()
    let failures = 1
    server.use(
      http.get(`${API}/route-plans/${plan.id}`, () =>
        failures-- > 0
          ? HttpResponse.json({ status: 500, title: 'Server error' }, { status: 500 })
          : undefined,
      ),
    )
    const user = await renderPlan(plan.id)
    expect(await screen.findByText('Plan nije moguće učitati.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await screen.findByTestId('plan-status')).toBeInTheDocument()
  })
})
