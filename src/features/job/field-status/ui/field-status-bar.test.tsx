import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getJob, getMyDay, type Job, transitionJob } from '@/entities/job'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { todayInTimeZone } from '@/shared/lib/datetime'
import { Toaster } from '@/shared/ui/sonner'

import { FieldStatusBar } from './field-status-bar'

const API = 'http://localhost/api/v1'

interface Sent {
  path: string
  body: Record<string, unknown>
  key: string | null
}
let sent: Sent[]
let geo: { lat: number; lng: number } | 'denied'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sent = []
  geo = { lat: 45.8, lng: 15.97 }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (
        success: (position: GeolocationPosition) => void,
        error: (error: GeolocationPositionError) => void,
      ) => {
        if (geo === 'denied') error({ code: 1 } as GeolocationPositionError)
        else success({ coords: { latitude: geo.lat, longitude: geo.lng } } as GeolocationPosition)
      },
    },
  })
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname.replace('/api/v1', '')
    if (request.method !== 'POST' || !path.endsWith('/transition')) return
    const entry: Sent = { path, body: {}, key: request.headers.get('Idempotency-Key') }
    sent.push(entry)
    void request
      .clone()
      .json()
      .then((body: Record<string, unknown>) => {
        entry.body = body
      })
  })
  // Petra, a technician with jobs today
  sessionStore.setTokens(await login({ email: 'petra@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

/** One of Petra's jobs today in the given status. */
async function myJob(status: Job['status']): Promise<Job> {
  const day = await getMyDay(todayInTimeZone('Europe/Zagreb'))
  const job = day.jobs.find((candidate) => candidate.status === status)
  if (!job) throw new Error(`Seed needs a ${status} job for Petra today`)
  return getJob(job.id)
}

function renderBar(job: Job) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <FieldStatusBar jobId={job.id} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('FieldStatusBar', () => {
  it('one big button for the next step; the position and version go with it', async () => {
    const job = await myJob('scheduled')
    const user = renderBar(job)
    await user.click(await screen.findByRole('button', { name: 'Označi: na putu' }))
    expect(await screen.findByText('Status naloga: Na putu.')).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.body).toEqual({ to: 'en_route', version: job.version, lat: 45.8, lng: 15.97 })
    // The button changes with the job: now the next step is arriving
    expect(await screen.findByRole('button', { name: 'Označi: na lokaciji' })).toBeInTheDocument()
  })

  it('no position (denied) never stops the change', async () => {
    geo = 'denied'
    const job = await myJob('scheduled')
    const user = renderBar(job)
    await user.click(await screen.findByRole('button', { name: 'Označi: na putu' }))
    expect(await screen.findByText('Status naloga: Na putu.')).toBeInTheDocument()
    expect(sent[0]?.body).toEqual({ to: 'en_route', version: job.version })
  })

  it('on site: only "Više" (on hold); completing is not offered here', async () => {
    const enRoute = await myJob('en_route')
    const job = await transitionJob(enRoute.id, { to: 'on_site', version: enRoute.version })
    sent = []
    const user = renderBar(job)
    expect(screen.queryByRole('button', { name: /Završi/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Više radnji' }))
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1)
    await user.click(screen.getByRole('menuitem', { name: 'Stavi na čekanje' }))

    const dialog = await screen.findByRole('dialog', { name: 'Stavi na čekanje' })
    await user.click(screen.getByRole('button', { name: 'Stavi na čekanje', hidden: false }))
    expect(await screen.findByText('Upišite razlog.')).toBeInTheDocument()
    expect(sent).toHaveLength(0)
    await user.type(screen.getByLabelText('Razlog'), 'Čeka se rezervni dio.')
    await user.click(screen.getAllByRole('button', { name: 'Stavi na čekanje' }).at(-1) ?? dialog)
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(sent[0]?.body).toMatchObject({
      to: 'on_hold',
      note: 'Čeka se rezervni dio.',
      version: job.version,
    })
  })

  it('409: refetches, tells the user, and the button follows the job', async () => {
    const job = await myJob('scheduled')
    // Someone else moved the job on meanwhile; our version is stale
    let moved = false
    server.use(
      http.post(`${API}/jobs/:id/transition`, () => {
        moved = true
        return HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 })
      }),
      http.get(`${API}/jobs/:id`, () =>
        HttpResponse.json(
          moved
            ? {
                ...job,
                status: 'en_route',
                version: job.version + 1,
                allowedTransitions: ['on_site'],
              }
            : job,
        ),
      ),
    )
    const user = renderBar(job)
    await user.click(await screen.findByRole('button', { name: 'Označi: na putu' }))
    expect(
      await screen.findByText('Nalog je u međuvremenu promijenjen. Prikazani su najnoviji podaci.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Označi: na lokaciji' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Označi: na putu' })).not.toBeInTheDocument()
  })

  it('trying again after a network error reuses the idempotency key', async () => {
    let failures = 1
    server.use(
      http.post(`${API}/jobs/:id/transition`, () =>
        failures-- > 0 ? HttpResponse.error() : undefined,
      ),
    )
    const job = await myJob('scheduled')
    const user = renderBar(job)
    await user.click(await screen.findByRole('button', { name: 'Označi: na putu' }))
    expect(
      await screen.findByText('Status nije promijenjen. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Označi: na putu' }))
    expect(await screen.findByText('Status naloga: Na putu.')).toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(sent[1]?.key).toBe(sent[0]?.key)
  })

  it('a finished job has no action bar', async () => {
    const day = await getMyDay(todayInTimeZone('Europe/Zagreb'))
    const job = day.jobs[0]
    if (!job) throw new Error('Seed needs a job')
    server.use(
      http.get(`${API}/jobs/:id`, () =>
        HttpResponse.json({ ...job, status: 'completed', allowedTransitions: ['invoiced'] }),
      ),
    )
    renderBar(job)
    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })
})
