import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { QuickJobForm } from './quick-job-form'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

const API = 'http://localhost/api/v1'

interface Sent {
  method: string
  path: string
  body: unknown
  key: string | null
}
let sent: Sent[]

beforeEach(() => {
  resetMockDb()
  // The app wires this at start-up (app/providers/session.ts)
  configureSessionStore(sessionStore)
  sessionStore.clear()
  navigate.mockReset()
  sent = []
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname.replace('/api/v1', '')
    // Only the form's writes (not GETs, not the test's own sign-in)
    if (request.method === 'GET' || path.startsWith('/auth/')) return
    const entry: Sent = {
      method: request.method,
      path,
      body: undefined,
      key: request.headers.get('Idempotency-Key'),
    }
    sent.push(entry)
    void request
      .clone()
      .json()
      .then((body: unknown) => {
        entry.body = body
      })
      .catch(() => undefined)
  })
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

const writes = (path: string) => sent.filter((request) => request.path === path)

async function renderForm(email: string) {
  sessionStore.setTokens(await login({ email, password: 'demo' }))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <QuickJobForm />
      <Toaster />
    </QueryClientProvider>,
  )
  await screen.findByLabelText('Broj s kojeg klijent zove')
  return userEvent.setup()
}

type User = ReturnType<typeof userEvent.setup>

async function findByPhone(user: User, phone: string) {
  await user.type(screen.getByLabelText('Broj s kojeg klijent zove'), phone)
  await user.click(screen.getByRole('button', { name: 'Traži' }))
}

async function describeJob(user: User, title: string) {
  const jobType = screen.getByLabelText(/^Vrsta naloga/)
  const firstType = within(jobType).getAllByRole('option')[1]
  if (!firstType) throw new Error('The tenant has no job types')
  await user.selectOptions(jobType, firstType)
  await user.type(screen.getByLabelText(/^Naslov/), title)
}

const save = (user: User) => user.click(screen.getByRole('button', { name: 'Spremi nalog' }))

describe('QuickJobForm', () => {
  it('existing client by phone: the job goes to the picked client and location', async () => {
    const user = await renderForm('dispecer@alarmko.test')
    await findByPhone(user, '091 210 0001')
    expect(await screen.findByText('Klijenti s brojem 091 210 0001')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Odaberi' }))

    const location = await screen.findByRole('radio', { name: /Savska cesta 45/ })
    await user.click(location)
    await describeJob(user, 'Kvar na ulazu')
    await user.click(screen.getByRole('radio', { name: 'Hitno' }))
    await save(user)

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledOnce()
    })
    expect(writes('/clients')).toHaveLength(0)
    expect(writes('/jobs')).toHaveLength(1)
    expect(writes('/jobs')[0]?.body).toMatchObject({
      title: 'Kvar na ulazu',
      priority: 'urgent',
      source: 'phone',
      assetId: null,
    })
    expect(await screen.findByText(/^Nalog RN-\d{4}-\d{4} je otvoren\.$/)).toBeInTheDocument()
  })

  it('an unknown number offers a new client with it; required client fields come from the tenant', async () => {
    const user = await renderForm('dispecer@alarmko.test')
    await findByPhone(user, '098 555 1234')
    expect(await screen.findByText('Nema klijenta s brojem 098 555 1234.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Novi klijent s ovim brojem' }))

    expect(screen.getByRole('textbox', { name: 'Telefon' })).toHaveValue('098 555 1234')
    await user.type(screen.getByLabelText(/^Ime i prezime/), 'Marina Novak')
    await user.type(screen.getByLabelText(/^Ulica i kućni broj/), 'Ilica 5')
    await user.type(screen.getByLabelText(/^Mjesto/), 'Zagreb')
    await describeJob(user, 'Ugradnja')
    await save(user)

    // This tenant requires a client field (from /custom-fields, not from code)
    const required = await screen.findAllByText('Obavezno polje.')
    expect(required.length).toBeGreaterThan(0)
    expect(writes('/clients')).toHaveLength(0)
  })

  it('new client: client with its first location, then the job; a failed job is retried alone', async () => {
    let failJob = true
    server.use(
      http.post(`${API}/jobs`, () => {
        if (!failJob) return undefined
        failJob = false
        return HttpResponse.json(
          { status: 400, title: 'Validation', errors: { title: ['Naslov je prekratak.'] } },
          { status: 400 },
        )
      }),
    )
    const user = await renderForm('dispecer@bura.test')
    await user.click(screen.getByRole('button', { name: 'Novi klijent' }))
    await user.type(screen.getByLabelText(/^Ime i prezime/), 'Marina Novak')
    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '098 555 1234')
    await user.type(screen.getByLabelText(/^Ulica i kućni broj/), 'Put Firula 12')
    await user.type(screen.getByLabelText(/^Mjesto/), 'Split')
    await describeJob(user, 'Ug')
    await save(user)

    // The 400 lands next to the title; the client is saved and now picked
    expect(await screen.findByText('Naslov je prekratak.')).toBeInTheDocument()
    // Next to the field, not in a toast
    expect(screen.getByLabelText(/^Naslov/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Marina Novak')).toBeInTheDocument()
    expect(writes('/clients')).toHaveLength(1)
    expect(writes('/clients')[0]?.body).toMatchObject({
      type: 'person',
      name: 'Marina Novak',
      contacts: [{ name: 'Marina Novak', phone: '098 555 1234', isPrimary: true }],
      firstLocation: { street: 'Put Firula 12', city: 'Split', country: 'HR' },
    })

    await user.type(screen.getByLabelText(/^Naslov/), 'radnja')
    await save(user)
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledOnce()
    })
    expect(writes('/clients')).toHaveLength(1)
    expect(writes('/jobs')).toHaveLength(2)
  })

  it('trying the job again after a network error reuses its idempotency key', async () => {
    let failures = 1
    server.use(http.post(`${API}/jobs`, () => (failures-- > 0 ? HttpResponse.error() : undefined)))
    const user = await renderForm('dispecer@alarmko.test')
    await findByPhone(user, '091 210 0001')
    await user.click(await screen.findByRole('button', { name: 'Odaberi' }))
    await user.click(await screen.findByRole('radio', { name: /Ilica 120/ }))
    await describeJob(user, 'Servis')
    await save(user)
    expect(await screen.findByText('Nalog nije spremljen. Pokušajte ponovno.')).toBeInTheDocument()

    await save(user)
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledOnce()
    })
    const jobs = writes('/jobs')
    expect(jobs).toHaveLength(2)
    expect(jobs[1]?.key).toBe(jobs[0]?.key)
  })

  it('a new location for an existing client is saved first, then the job uses it', async () => {
    const user = await renderForm('dispecer@alarmko.test')
    await findByPhone(user, '091 210 0001')
    await user.click(await screen.findByRole('button', { name: 'Odaberi' }))
    await user.click(await screen.findByRole('radio', { name: 'Nova lokacija' }))
    await user.type(screen.getByLabelText(/^Ulica i kućni broj/), 'Vukovarska 1')
    await user.type(screen.getByLabelText(/^Mjesto/), 'Zagreb')
    await describeJob(user, 'Pregled')
    await save(user)

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledOnce()
    })
    const [location, job] = sent.map((request) => `${request.method} ${request.path}`)
    expect(sent).toHaveLength(2)
    expect(location).toMatch(/^POST \/clients\/[^/]+\/locations$/)
    expect(job).toBe('POST /jobs')
    expect(writes('/jobs')[0]?.body).toHaveProperty('locationId')
    expect(await screen.findByText(/je otvoren\.$/)).toBeInTheDocument()
  })

  it('offers only active job types', async () => {
    const jobType = (name: string, isActive: boolean) => ({
      id: name,
      name,
      color: '#336699',
      defaultDurationMin: 60,
      requiredPeople: 1,
      requiredSkillIds: [],
      smsEnabled: false,
      isActive,
    })
    server.use(
      http.get(`${API}/job-types`, () =>
        HttpResponse.json([jobType('Aktivna', true), jobType('Ugašena', false)]),
      ),
    )
    await renderForm('dispecer@alarmko.test')
    const options = within(screen.getByLabelText(/^Vrsta naloga/)).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Odaberite vrstu…', 'Aktivna'])
  })

  it('a number the API rejects: its message next to the phone', async () => {
    const user = await renderForm('dispecer@alarmko.test')
    await findByPhone(user, 'abc')
    expect(await screen.findByText('Neispravan broj telefona.')).toBeInTheDocument()
    expect(screen.getByLabelText('Broj s kojeg klijent zove')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})
