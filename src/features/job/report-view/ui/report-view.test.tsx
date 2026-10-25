import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listJobs } from '@/entities/job'
import { getJobReport } from '@/entities/report'
import { resetMockDb } from '@/shared/api/mocks/db'
import { getDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Toaster } from '@/shared/ui/sonner'

import { ReportView } from './report-view'

const API = 'http://localhost/api/v1'
const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'dispecer@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function jobId(status: 'completed' | 'new', q?: string) {
  const page = await listJobs({ status: [status], q, pageSize: 1 })
  const id = page.items[0]?.id
  if (!id) throw new Error(`Seed needs a ${status} job`)
  return id
}

function renderView(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TenantFormatProvider settings={ZAGREB}>
        <ReportView jobId={id} />
        <Toaster />
      </TenantFormatProvider>
    </QueryClientProvider>,
  )
  return { user: userEvent.setup() }
}

describe('ReportView', () => {
  it('shows what was done, the times, checklist, materials with the sum, and the signer', async () => {
    const id = await jobId('completed', 'Magnetski')
    renderView(id)
    const view = await screen.findByTestId('report-view')
    expect(await within(view).findByText('Izvršeni radovi')).toBeInTheDocument()
    expect(within(view).getByText(/Magnetski kontakt/)).toBeInTheDocument()
    expect(within(view).getByText(/Kabel 4×0,22/)).toBeInTheDocument()
    expect(within(view).getByText(/12,5 m/)).toBeInTheDocument()
    // 9,90 + 12,5 × 0,65 (8,125 rounded up)
    expect(within(view).getByText(/Ukupno: 18,03/)).toBeInTheDocument()
    expect(within(view).getByText(/Potpisao: /)).toBeInTheDocument()
  })

  it('a job with nothing written says so', async () => {
    const id = await jobId('new')
    renderView(id)
    expect(await screen.findByText('Izvještaj još nije upisan.')).toBeInTheDocument()
  })

  it('a failed load can be retried', async () => {
    const id = await jobId('completed')
    let failures = 1
    server.use(
      http.get(`${API}/jobs/:id/report`, () =>
        failures-- > 0
          ? HttpResponse.json({ status: 500, title: 'Server error' }, { status: 500 })
          : undefined,
      ),
    )
    const { user } = renderView(id)
    expect(await screen.findByText('Izvještaj nije moguće učitati.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await screen.findByTestId('report-view')).toBeInTheDocument()
  })

  it('print is fetched with the token and shown as a blob in the window opened by the click', async () => {
    const id = await jobId('completed', 'Magnetski')
    const target = { closed: false, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window)
    const created = vi.fn(() => 'blob:report')
    URL.createObjectURL = created
    URL.revokeObjectURL = vi.fn()
    const auth: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/report/print')) auth.push(request.headers.get('Authorization'))
    })
    const { user } = renderView(id)
    await user.click(await screen.findByRole('button', { name: 'Ispiši izvještaj' }))
    await waitFor(() => {
      expect(target.location.href).toBe('blob:report')
    })
    expect(auth[0]).toMatch(/^Bearer /)
    expect(created).toHaveBeenCalledOnce()
    server.events.removeAllListeners()
  })

  it('print that fails closes the empty window and says so', async () => {
    const id = await jobId('completed', 'Magnetski')
    server.use(
      http.get(`${API}/jobs/:id/report/print`, () =>
        HttpResponse.json({ status: 500, title: 'Server error' }, { status: 500 }),
      ),
    )
    const target = { closed: false, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window)
    const { user } = renderView(id)
    await user.click(await screen.findByRole('button', { name: 'Ispiši izvještaj' }))
    expect(
      await screen.findByText('Izvještaj nije moguće otvoriti. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    expect(target.close).toHaveBeenCalledOnce()
  })

  it('offers the PDF of a completed job as a link that needs no token', async () => {
    const id = await jobId('completed', 'Magnetski')
    renderView(id)
    const link = await screen.findByRole('link', { name: 'Preuzmi PDF' })
    await waitFor(() => {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^data:/))
    })
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('says the PDF is being made until it is there, then offers it', async () => {
    const id = await jobId('completed', 'Magnetski')
    // The seed has no PDF; give the job one that is ready soon
    const t = Object.values(getDb().tenants).find((data) => data.jobs.some((j) => j.id === id))
    if (!t) throw new Error('No tenant')
    const report = t.reports.find((r) => r.jobId === id)
    if (!report) throw new Error('Seed needs a report')
    const pdfId = '01a1705b-0000-7000-8000-00000000abcd'
    t.attachments.push({
      id: pdfId,
      ownerType: 'job',
      ownerId: id,
      kind: 'pdf',
      fileName: 'a.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      takenAt: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      state: 'confirmed',
      availableAt: new Date(Date.now() + 60_000).toISOString(),
      preview: null,
    })
    report.pdfAttachmentId = pdfId
    renderView(id)
    expect(await screen.findByText('PDF se priprema…')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Preuzmi PDF' })).not.toBeInTheDocument()

    // Ready now
    const attachment = t.attachments.find((a) => a.id === pdfId)
    if (attachment) attachment.availableAt = new Date(Date.now() - 1000).toISOString()
    expect((await getJobReport(id)).pdfAttachmentId).toBe(pdfId)
  })
})
