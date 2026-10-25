import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sessionStore } from '@/entities/auth'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import type { JobRow, TenantData } from '@/shared/api/mocks/db/rows'
import { ensurePublicToken } from '@/shared/api/mocks/lib/messages'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { addDays } from '@/shared/lib/datetime'

import { Appointment } from './appointment'

const API = 'http://localhost/api/v1'

beforeEach(() => {
  resetMockDb()
  // The client is nobody: no session at all
  configureSessionStore(sessionStore)
  sessionStore.clear()
})

afterEach(() => {
  server.events.removeAllListeners()
})

function aJob(status: JobRow['status'] = 'scheduled'): {
  t: TenantData
  job: JobRow
  token: string
} {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  const job = t?.jobs.find(
    (j) =>
      j.status === status &&
      j.scheduledDate &&
      j.scheduledStart &&
      !j.rescheduleRequestedAt &&
      t.contacts.some((c) => c.clientId === j.clientId && !c.deletedAt),
  )
  if (!t || !job) throw new Error(`Seed needs a ${status} job with a time`)
  return { t, job, token: ensurePublicToken(t, job) }
}

function renderPage(token: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Appointment token={token} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const status = () => screen.findByTestId('public-status')

describe('the client’s page', () => {
  it('shows the appointment: who, what, where, when, and the company to call', async () => {
    const { t, job, token } = aJob()
    renderPage(token)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/^Dobar dan, \S+$/)
    expect(screen.getByText(`Nalog ${job.number}`, { exact: false })).toBeInTheDocument()
    expect(screen.getByTestId('public-company')).toHaveTextContent(t.tenant.name)
    expect(screen.getByTestId('public-when')).toHaveTextContent(
      /monter stiže između \d\d:\d\d i \d\d:\d\d/,
    )
    expect(await status()).toHaveTextContent('Termin čeka vašu potvrdu.')
    expect(screen.getByRole('button', { name: 'Potvrđujem termin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tražim drugi termin' })).toBeInTheDocument()
    if (t.tenant.phone) {
      expect(screen.getByRole('link', { name: /\d/ })).toHaveAttribute(
        'href',
        `tel:${t.tenant.phone}`,
      )
    }
  })

  it('wears the company’s colour on its buttons', async () => {
    const { t, token } = aJob()
    renderPage(token)
    await status()
    const main = screen.getByRole('main')
    expect(main.style.getPropertyValue('--primary')).toBe(t.tenant.settings.pdfAccentColor)
    expect(main.style.getPropertyValue('--primary-foreground')).toMatch(/^#(000000|ffffff)$/)
  })

  it('confirms the appointment, and then says it is confirmed', async () => {
    const { job, token } = aJob()
    const user = renderPage(token)
    await user.click(await screen.findByRole('button', { name: 'Potvrđujem termin' }))
    await waitFor(async () => {
      expect(await status()).toHaveTextContent('Termin je potvrđen.')
    })
    expect(screen.queryByRole('button', { name: 'Potvrđujem termin' })).not.toBeInTheDocument()
    expect(job.status).toBe('confirmed')
  })

  it('a job that can no longer be confirmed says so, and shows how it is now (409)', async () => {
    const { job, token } = aJob()
    const user = renderPage(token)
    const button = await screen.findByRole('button', { name: 'Potvrđujem termin' })
    // The office moved on while the page was open
    job.status = 'en_route'
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(/više se ne može potvrditi/)
    await waitFor(async () => {
      expect(await status()).toHaveTextContent('Monter je na putu.')
    })
    expect(screen.queryByRole('button', { name: 'Potvrđujem termin' })).not.toBeInTheDocument()
  })

  it('asks for another time with a note and days, and then says it has asked', async () => {
    let sent: { note?: string; preferredDates?: string[] } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/reschedule-request')) {
        void request
          .clone()
          .json()
          .then((body: typeof sent) => {
            sent = body
          })
      }
    })
    const { token } = aJob()
    const user = renderPage(token)
    await user.click(await screen.findByRole('button', { name: 'Tražim drugi termin' }))
    const form = screen.getByRole('form', { name: 'Tražim drugi termin' })
    await user.type(within(form).getByLabelText('Napomena'), 'Poslije podne.')
    const later = addDays(new Date().toISOString().slice(0, 10), 10)
    await user.type(within(form).getByLabelText('Dan 1'), later)
    await user.click(within(form).getByRole('button', { name: 'Pošalji zahtjev' }))

    await waitFor(async () => {
      expect(await status()).toHaveTextContent('Zatražili ste novi termin.')
    })
    expect(sent).toEqual({ note: 'Poslije podne.', preferredDates: [later] })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tražim drugi termin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potvrđujem termin' })).not.toBeInTheDocument()
  })

  it('does not send a request with a day in the past or a note that is too long', async () => {
    let asked = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/reschedule-request')) asked += 1
    })
    const { token } = aJob()
    const user = renderPage(token)
    await user.click(await screen.findByRole('button', { name: 'Tražim drugi termin' }))
    const form = screen.getByRole('form', { name: 'Tražim drugi termin' })
    await user.click(within(form).getByLabelText('Napomena'))
    await user.paste('x'.repeat(501))
    await user.type(within(form).getByLabelText('Dan 1'), '2020-01-01')
    await user.click(within(form).getByRole('button', { name: 'Pošalji zahtjev' }))
    expect(await within(form).findByText('Napomena ima najviše 500 znakova.')).toBeInTheDocument()
    expect(within(form).getByText('Odaberite dan od danas nadalje.')).toBeInTheDocument()
    expect(asked).toBe(0)
  })

  it('can be asked for with nothing written, and taken back', async () => {
    const { token } = aJob('confirmed')
    const user = renderPage(token)
    await user.click(await screen.findByRole('button', { name: 'Tražim drugi termin' }))
    await user.click(screen.getByRole('button', { name: 'Odustani' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tražim drugi termin' }))
    await user.click(screen.getByRole('button', { name: 'Pošalji zahtjev' }))
    await waitFor(async () => {
      expect(await status()).toHaveTextContent('Zatražili ste novi termin.')
    })
  })

  it('says how a job under way, finished or cancelled stands, with nothing to press', async () => {
    const { job, token } = aJob()
    for (const [state, text] of [
      ['en_route', 'Monter je na putu.'],
      ['completed', 'Posao je obavljen.'],
      ['cancelled', 'Nalog je otkazan.'],
    ] as const) {
      job.status = state
      renderPage(token)
      expect(await status()).toHaveTextContent(text)
      expect(screen.queryByRole('button', { name: 'Potvrđujem termin' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Tražim drugi termin' })).not.toBeInTheDocument()
      document.body.innerHTML = ''
    }
  })
})

describe('a link that does not work', () => {
  it('a wrong one says it is wrong', async () => {
    renderPage('pub_nothing')
    expect(
      await screen.findByRole('heading', { name: 'Poveznica nije ispravna' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potvrđujem termin' })).not.toBeInTheDocument()
  })

  it('one that has run out says so', async () => {
    const { job, token } = aJob()
    job.publicTokenExpiresAt = '2020-01-01T00:00:00Z'
    renderPage(token)
    expect(await screen.findByRole('heading', { name: 'Poveznica je istekla' })).toBeInTheDocument()
  })

  it('a page that cannot be loaded says so and tries again', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/public/jobs/:token`, () => {
        calls += 1
        return HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 })
      }),
    )
    const user = renderPage('pub_x')
    expect(await screen.findByText('Stranicu nije moguće učitati')).toBeInTheDocument()
    const before = calls
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    await waitFor(() => {
      expect(calls).toBeGreaterThan(before)
    })
  })
})
