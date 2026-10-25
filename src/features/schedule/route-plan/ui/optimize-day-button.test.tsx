import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'

import { OptimizeDayButton } from './optimize-day-button'

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

let sent: Record<string, unknown>[]

beforeEach(() => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sent = []
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'POST' || !request.url.endsWith('/route-plans/optimize')) return
    void request
      .clone()
      .json()
      .then((body: Record<string, unknown>) => sent.push(body))
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function renderButton(email: string) {
  sessionStore.setTokens(await login({ email, password: 'demo' }))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(<OptimizeDayButton date={workday()} />, {
    wrap: (children) => (
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={ZAGREB}>
          <Suspense fallback="…">{children}</Suspense>
        </TenantFormatProvider>
      </QueryClientProvider>
    ),
  })
  return userEvent.setup()
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Optimiraj dan' }))
  const dialog = await screen.findByRole('dialog', { name: 'Optimiraj rute' })
  await within(dialog).findAllByRole('checkbox')
  return dialog
}

describe('OptimizeDayButton', () => {
  it("is off, with the reason, when the tenant's plan has no optimisation", async () => {
    await renderButton('dispecer@bura.test')
    expect(await screen.findByRole('button', { name: 'Optimiraj dan' })).toBeDisabled()
    expect(screen.getByText('Optimizacija ruta nije u vašem paketu.')).toBeInTheDocument()
  })

  it("offers the day's working technicians and jobs, all chosen, and sends the choice", async () => {
    const user = await renderButton('dispecer@alarmko.test')
    const dialog = await open(user)
    const boxes = within(dialog).getAllByRole('checkbox')
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true)

    // Leave one job out
    const jobBoxes = boxes.slice(3)
    const [leftOut] = jobBoxes
    if (!leftOut) throw new Error('Seed needs jobs')
    await user.click(leftOut)
    await user.click(within(dialog).getByRole('button', { name: 'Napravi plan' }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    const body = sent[0] as { date: string; technicianIds: string[]; jobIds: string[] }
    expect(body.date).toBe(workday())
    expect(body.technicianIds).toHaveLength(3)
    expect(body.jobIds).toHaveLength(jobBoxes.length - 1)
  })

  it('needs a technician and a job', async () => {
    const user = await renderButton('dispecer@alarmko.test')
    const dialog = await open(user)
    for (const box of within(dialog).getAllByRole('checkbox').slice(0, 3)) await user.click(box)
    expect(within(dialog).getByText('Odaberite barem jednog montera.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Napravi plan' })).toBeDisabled()
    expect(sent).toHaveLength(0)
  })

  it('shows that it is working while the solver runs, and cannot be closed or started twice', async () => {
    server.use(
      http.post(`${API}/route-plans/optimize`, async () => {
        await delay(400)
        return HttpResponse.json({ status: 502, title: 'Bad gateway' }, { status: 502 })
      }),
    )
    const user = await renderButton('dispecer@alarmko.test')
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Napravi plan' }))
    expect(await within(dialog).findByText(/Računam rute/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Napravi plan' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Odustani' })).toBeDisabled()
    expect(
      await within(dialog).findByText('Optimizacija nije uspjela. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    // Back to choosing: try again
    expect(within(dialog).getByRole('button', { name: 'Napravi plan' })).toBeEnabled()
  })

  it('402: says the plan does not include it', async () => {
    server.use(
      http.post(`${API}/route-plans/optimize`, () =>
        HttpResponse.json({ status: 402, title: 'Payment required' }, { status: 402 }),
      ),
    )
    const user = await renderButton('dispecer@alarmko.test')
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Napravi plan' }))
    expect(
      await within(dialog).findByText('Vaš paket ne uključuje optimizaciju ruta.'),
    ).toBeInTheDocument()
  })
})
