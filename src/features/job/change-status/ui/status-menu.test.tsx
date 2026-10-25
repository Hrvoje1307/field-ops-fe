import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Job, jobKeys, useGetJob } from '@/entities/job'
import type { TransitionRequest } from '@/shared/api/generated/model'
import { server } from '@/shared/api/mocks/node'
import { Toaster } from '@/shared/ui/sonner'

import { StatusMenu } from './status-menu'

const API = 'http://localhost/api/v1'

type MenuJob = Pick<Job, 'id' | 'number' | 'version' | 'allowedTransitions' | 'status'>

/** The job as the server has it; tests change it to simulate someone else's edit. */
let serverJob: MenuJob
let requests: { body: TransitionRequest; key: string | null }[]
/** What POST /transition answers; defaults to applying the change. */
let respond: (body: TransitionRequest) => Response | undefined

beforeEach(() => {
  serverJob = {
    id: 'job-1',
    number: 'RN-2026-0001',
    status: 'scheduled',
    version: 3,
    allowedTransitions: ['confirmed', 'en_route', 'new', 'cancelled'],
  }
  requests = []
  respond = () => undefined
  server.use(
    http.get(`${API}/jobs/:id`, () => HttpResponse.json(serverJob)),
    http.post(`${API}/jobs/:id/transition`, async ({ request }) => {
      const body = (await request.json()) as TransitionRequest
      requests.push({ body, key: request.headers.get('Idempotency-Key') })
      const answer = respond(body)
      if (answer) return answer
      serverJob = {
        ...serverJob,
        status: body.to,
        version: serverJob.version + 1,
        allowedTransitions: body.to === 'cancelled' ? ['new'] : [],
      }
      return HttpResponse.json(serverJob)
    }),
  )
})

// Sonner keeps its toasts in module state, across rendered Toasters
afterEach(() => {
  toast.dismiss()
})

/** Like the job page: other parts show the same cached job as the menu. */
function Page() {
  const job = useGetJob('job-1')
  return job.data ? (
    <>
      <p data-testid="status">{job.data.status}</p>
      <StatusMenu jobId="job-1" />
    </>
  ) : null
}

async function renderMenu(overrides?: Partial<MenuJob>) {
  if (overrides) serverJob = { ...serverJob, ...overrides }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Page />
      <Toaster />
    </QueryClientProvider>,
  )
  await screen.findByTestId('status')
  return { user: userEvent.setup(), queryClient }
}

async function choose(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole('button', { name: 'Promijeni status' }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

const problem = (status: number, extra: object = {}) =>
  HttpResponse.json({ status, title: 'Error', ...extra }, { status })

describe('StatusMenu', () => {
  it('offers exactly the allowed changes, never "completed" (that goes through /complete)', async () => {
    const { user } = await renderMenu({
      status: 'on_site',
      allowedTransitions: ['completed', 'on_hold'],
    })
    await user.click(screen.getByRole('button', { name: 'Promijeni status' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Stavi na čekanje'])
  })

  it('shows no menu when nothing is allowed', async () => {
    await renderMenu({ status: 'invoiced', allowedTransitions: [] })
    expect(screen.queryByRole('button', { name: 'Promijeni status' })).not.toBeInTheDocument()
  })

  it('applies a plain change straight away, with the version and an idempotency key', async () => {
    const { user, queryClient } = await renderMenu()
    await choose(user, 'Potvrdi termin')
    expect(await screen.findByText('Status naloga: Potvrđen.')).toBeInTheDocument()
    expect(requests.map((request) => request.body)).toEqual([{ to: 'confirmed', version: 3 }])
    expect(requests[0]?.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(queryClient.getQueryData(jobKeys.detail('job-1'))).toMatchObject({
      status: 'confirmed',
      version: 4,
    })
    expect(screen.getByTestId('status')).toHaveTextContent('confirmed')
  })

  it('asks for a reason before cancelling and sends it', async () => {
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    const dialog = await screen.findByRole('dialog', { name: 'Otkaži nalog' })
    expect(dialog).toHaveTextContent('Nalog RN-2026-0001 se otkazuje.')

    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    expect(await screen.findByText('Upišite razlog.')).toBeInTheDocument()
    expect(requests).toEqual([])

    await user.type(screen.getByLabelText('Razlog'), '  Klijent je odustao.  ')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(requests.map((request) => request.body)).toEqual([
      { to: 'cancelled', note: 'Klijent je odustao.', version: 3 },
    ])
    expect(await screen.findByText('Status naloga: Otkazan.')).toBeInTheDocument()
  })

  it('confirms going back to new (no note asked)', async () => {
    const { user } = await renderMenu()
    await choose(user, 'Vrati u nove')
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Nalog RN-2026-0001 vraća se među nove naloge.',
    )
    expect(screen.queryByLabelText('Razlog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vrati u nove' }))
    await waitFor(() => {
      expect(requests.map((request) => request.body)).toEqual([{ to: 'new', version: 3 }])
    })
  })

  it('shows a 400 on the note next to it and keeps the dialog', async () => {
    respond = () => problem(400, { errors: { note: ['Razlog je prekratak.'] } })
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    await user.type(await screen.findByLabelText('Razlog'), 'x')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    expect(await screen.findByText('Razlog je prekratak.')).toBeInTheDocument()
    expect(screen.getByLabelText('Razlog')).toHaveValue('x')
  })

  it('409, still allowed: refetches, keeps the note, and the retry sends the new version', async () => {
    let first = true
    respond = () => {
      if (!first) return undefined
      first = false
      // Someone else changed the job meanwhile (e.g. confirmed it)
      serverJob = {
        ...serverJob,
        status: 'confirmed',
        version: 4,
        allowedTransitions: ['en_route', 'scheduled', 'cancelled'],
      }
      return problem(409, { code: 'job.version_conflict' })
    }
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    await user.type(await screen.findByLabelText('Razlog'), 'Klijent je odustao.')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))

    expect(
      await screen.findByText('Nalog je u međuvremenu promijenjen. Prikazani su najnoviji podaci.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Nalog je u međuvremenu promijenjen. Provjerite podatke i pokušajte ponovno.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('confirmed')
    })
    expect(screen.getByLabelText('Razlog')).toHaveValue('Klijent je odustao.')

    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(requests.map((request) => request.body.version)).toEqual([3, 4])
  })

  it('409, no longer allowed: says so and offers only closing', async () => {
    respond = () => {
      serverJob = { ...serverJob, status: 'en_route', version: 4, allowedTransitions: ['on_site'] }
      return problem(409, { code: 'job.invalid_transition' })
    }
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    await user.type(await screen.findByLabelText('Razlog'), 'Klijent je odustao.')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))

    expect(
      await screen.findByText('Nalog je u međuvremenu promijenjen i ta promjena više nije moguća.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Otkaži nalog' })).not.toBeInTheDocument()
  })

  it('a 409 on a plain change refetches and tells the user', async () => {
    respond = () => {
      serverJob = { ...serverJob, status: 'cancelled', version: 4, allowedTransitions: ['new'] }
      return problem(409)
    }
    const { user } = await renderMenu()
    await choose(user, 'Potvrdi termin')
    expect(
      await screen.findByText('Nalog je u međuvremenu promijenjen. Prikazani su najnoviji podaci.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('cancelled')
    })
  })

  it('403: a toast, and the dialog stays open with the note', async () => {
    respond = () => problem(403)
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    await user.type(await screen.findByLabelText('Razlog'), 'Razlog')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    expect(await screen.findByText('Nemate pravo na ovu promjenu.')).toBeInTheDocument()
    expect(screen.getByLabelText('Razlog')).toHaveValue('Razlog')
  })

  it('trying the same change again after a network error reuses its idempotency key', async () => {
    let failures = 1
    respond = () => (failures-- > 0 ? HttpResponse.error() : undefined)
    const { user } = await renderMenu()
    await choose(user, 'Otkaži nalog')
    await user.type(await screen.findByLabelText('Razlog'), 'Klijent je odustao.')
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    expect(
      await screen.findByText('Status nije promijenjen. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Otkaži nalog' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.key).toBe(requests[0]?.key)
  })
})
