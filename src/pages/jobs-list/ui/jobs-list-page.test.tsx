import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/shared/api/mocks/node'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'

import { jobsSearchSchema } from '../model/search'
import { JobsListPage } from './jobs-list-page'

const NEW_YORK = {
  timeZone: 'America/New_York',
  locale: 'en-US',
  currency: 'USD',
  country: 'US',
} as const

afterEach(() => {
  vi.useRealTimers()
})

describe('JobsListPage', () => {
  it('resolves "today" in the tenant zone, not the browser zone', async () => {
    // Already the 25th in UTC and Zagreb, still the 24th in New York
    vi.useFakeTimers({ now: new Date('2026-10-25T02:30:00Z'), toFake: ['Date'] })
    const urls: URL[] = []
    server.use(
      http.get('http://localhost/api/v1/jobs', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ page: 1, pageSize: 50, totalCount: 0, items: [] })
      }),
      http.get('http://localhost/api/v1/job-types', () => HttpResponse.json([])),
      http.get('http://localhost/api/v1/technicians', () => HttpResponse.json([])),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={NEW_YORK}>
          <JobsListPage
            search={jobsSearchSchema.parse({ date: 'today' })}
            onSearchChange={() => undefined}
          />
        </TenantFormatProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Nema naloga za odabrane filtre.')).toBeInTheDocument()
    expect(urls[0]?.searchParams.get('from')).toBe('2026-10-24')
    expect(urls[0]?.searchParams.get('to')).toBe('2026-10-24')
  })
})
