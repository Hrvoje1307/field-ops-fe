import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listJobs } from '@/entities/job'
import { resetMockDb } from '@/shared/api/mocks/db'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'

import { FieldReportView } from './field-report-view'

const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const

beforeEach(() => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
})

async function renderFor(email: string, status: string) {
  sessionStore.setTokens(await login({ email, password: 'demo' }))
  const page = await listJobs({ status: [status as 'on_site'], pageSize: 1 })
  const id = page.items[0]?.id
  if (!id) throw new Error(`Seed needs a ${status} job`)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(<FieldReportView jobId={id} onCompleted={vi.fn()} />, {
    wrap: (children) => (
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={ZAGREB}>{children}</TenantFormatProvider>
      </QueryClientProvider>
    ),
  })
}

describe('FieldReportView', () => {
  it('is the form while the technician is on site', async () => {
    await renderFor('ivan@alarmko.test', 'on_site')
    expect(await screen.findByLabelText('Što je napravljeno')).toBeInTheDocument()
  })

  it('is what has been written, read-only, once the job is completed (no form, no notice)', async () => {
    await renderFor('petra@alarmko.test', 'completed')
    expect(await screen.findByTestId('report-view')).toBeInTheDocument()
    expect(screen.queryByLabelText('Što je napravljeno')).not.toBeInTheDocument()
    expect(screen.queryByText('Izvještaj se upisuje kad ste na lokaciji.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Natrag na nalog' })).toBeInTheDocument()
  })

  it('before the technician is on site it says when the report is written', async () => {
    await renderFor('ivan@alarmko.test', 'scheduled')
    expect(await screen.findByText('Izvještaj se upisuje kad ste na lokaciji.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Što je napravljeno')).not.toBeInTheDocument()
  })
})
