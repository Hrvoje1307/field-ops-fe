import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getDispatchBoard } from '@/entities/dispatch'
import { assignJob, getJob, type Job, jobKeys, listJobs } from '@/entities/job'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Toaster } from '@/shared/ui/sonner'

import { ScheduleJobButton } from './schedule-job-button'

const API = 'http://localhost/api/v1'
const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const

interface Sent {
  path: string
  body: Record<string, unknown>
  key: string | null
}
let sent: Sent[]

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sent = []
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname.replace('/api/v1', '')
    if (request.method !== 'POST' || !path.endsWith('/assign')) return
    const entry: Sent = { path, body: {}, key: request.headers.get('Idempotency-Key') }
    sent.push(entry)
    void request
      .clone()
      .json()
      .then((body: Record<string, unknown>) => {
        entry.body = body
      })
  })
  sessionStore.setTokens(await login({ email: 'dispecer@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

/** A job still in the queue (status new), and the tenant's technicians. */
async function queuedJob(): Promise<Job> {
  const page = await listJobs({ status: ['new'], pageSize: 1 })
  const summary = page.items[0]
  if (!summary) throw new Error('Seed needs a new job')
  return getJob(summary.id)
}

async function renderPanel(job: Job, scheduled = false, day = '2026-10-28') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TenantFormatProvider settings={ZAGREB}>
        <ScheduleJobButton jobId={job.id} number={job.number} scheduled={scheduled} day={day} />
        <Toaster />
      </TenantFormatProvider>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', {
      name: scheduled ? `Promijeni termin naloga ${job.number}` : `Zakaži nalog ${job.number}`,
    }),
  )
  const panel = await screen.findByRole('dialog', { name: 'Termin naloga' })
  await within(panel).findAllByRole('checkbox')
  return { user, panel, queryClient }
}

describe('ScheduleJobButton', () => {
  it('sends the tenant-local date and time as an instant, with the technician and version', async () => {
    const job = await queuedJob()
    const { user, panel } = await renderPanel(job)
    const [first] = within(panel).getAllByRole('checkbox')
    if (!first) throw new Error('No technicians')
    await user.click(first)
    await user.type(within(panel).getByLabelText('Početak'), '09:30')
    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))

    expect(await screen.findByText(`Nalog ${job.number} je zakazan.`)).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.path).toBe(`/jobs/${job.id}/assign`)
    // 28 October: Zagreb is UTC+1, so 09:30 is 08:30Z
    expect(sent[0]?.body).toMatchObject({
      scheduledDate: '2026-10-28',
      scheduledStart: '2026-10-28T08:30:00Z',
      version: job.version,
    })
    expect(sent[0]?.body.technicianIds).toHaveLength(1)
    const board = await getDispatchBoard('2026-10-28')
    expect(board.columns.flatMap((column) => column.jobs).map((j) => j.id)).toContain(job.id)
  })

  it('needs a technician; nothing is sent', async () => {
    const job = await queuedJob()
    const { user, panel } = await renderPanel(job)
    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))
    expect(await within(panel).findByText('Odaberite barem jednog montera.')).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('409: keeps the panel and the choices, then saves with the refetched version', async () => {
    const job = await queuedJob()
    let first = true
    server.use(
      http.post(`${API}/jobs/:id/assign`, () => {
        if (!first) return undefined
        first = false
        return HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 })
      }),
    )
    const { user, panel } = await renderPanel(job)
    const [checkbox] = within(panel).getAllByRole('checkbox')
    if (!checkbox) throw new Error('No technicians')
    await user.click(checkbox)
    await user.type(within(panel).getByLabelText('Početak'), '10:00')
    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))

    expect(
      await screen.findByText(
        'Nalog je u međuvremenu promijenjen. Provjerite termin i spremite ponovno.',
      ),
    ).toBeInTheDocument()
    expect(checkbox).toBeChecked()
    expect(within(panel).getByLabelText('Početak')).toHaveValue('10:00')

    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(sent).toHaveLength(2)
  })

  it('a scheduled job can be taken off the schedule: no technicians, the version', async () => {
    const job = await queuedJob()
    // Schedule it first (outside the UI), then open the panel for it
    const board = await getDispatchBoard('2026-10-28')
    const technician = board.columns[0]?.technician
    if (!technician) throw new Error('No technicians')
    const scheduled = await assignJob(job.id, {
      technicianIds: [technician.id],
      scheduledDate: '2026-10-28',
      version: job.version,
    })
    sent = []

    const { user, panel, queryClient } = await renderPanel(scheduled, true)
    expect(queryClient.getQueryData(jobKeys.detail(job.id))).toBeDefined()
    await user.click(within(panel).getByRole('button', { name: 'Ukloni iz rasporeda' }))
    expect(
      await screen.findByText(`Nalog ${job.number} je vraćen među nezakazane.`),
    ).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.body).toEqual({ technicianIds: [], version: scheduled.version })
    expect((await getJob(job.id)).status).toBe('new')
  })

  it('trying again after a network error reuses the idempotency key', async () => {
    const job = await queuedJob()
    let failures = 1
    server.use(
      http.post(`${API}/jobs/:id/assign`, () =>
        failures-- > 0 ? HttpResponse.error() : undefined,
      ),
    )
    const { user, panel } = await renderPanel(job)
    const [checkbox] = within(panel).getAllByRole('checkbox')
    if (!checkbox) throw new Error('No technicians')
    await user.click(checkbox)
    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))
    expect(await screen.findByText('Termin nije spremljen. Pokušajte ponovno.')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Spremi termin' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(sent).toHaveLength(2)
    expect(sent[1]?.key).toBe(sent[0]?.key)
  })
})
