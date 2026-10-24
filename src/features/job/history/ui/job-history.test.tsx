import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import type { StatusHistoryEntry } from '@/shared/api/generated/model'
import { server } from '@/shared/api/mocks/node'

import { JobHistory } from './job-history'

const HISTORY_URL = 'http://localhost/api/v1/jobs/:id/history'

function renderHistory(entries: StatusHistoryEntry[] | 'error') {
  server.use(
    http.get(HISTORY_URL, () =>
      entries === 'error'
        ? HttpResponse.json({ title: 'Boom' }, { status: 500 })
        : HttpResponse.json(entries),
    ),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <JobHistory jobId="job-1" />
    </QueryClientProvider>,
  )
}

describe('JobHistory', () => {
  it('lists changes newest first with who, when and the note', async () => {
    renderHistory([
      {
        id: 'a',
        fromStatus: null,
        toStatus: 'new',
        actor: 'user',
        changedBy: { id: 'u1', fullName: 'Ivana Babić' },
        changedAt: '2026-10-20T07:15:00Z',
      },
      {
        id: 'b',
        fromStatus: 'new',
        toStatus: 'scheduled',
        actor: 'system',
        changedAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'c',
        fromStatus: 'scheduled',
        toStatus: 'confirmed',
        actor: 'client',
        changedAt: '2026-10-20T09:00:00Z',
      },
      {
        id: 'd',
        fromStatus: 'confirmed',
        toStatus: 'cancelled',
        actor: 'user',
        changedBy: null,
        changedAt: '2026-10-20T10:00:00Z',
        note: 'Klijent je odustao.',
      },
    ])
    const items = within(await screen.findByTestId('job-history')).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('[data-status]')?.textContent)).toEqual([
      'Otkazan',
      'Potvrđen',
      'Zakazan',
      'Novi',
    ])
    expect(items[0]).toHaveTextContent('prije: Potvrđen')
    expect(items[0]).toHaveTextContent('Nepoznat korisnik')
    expect(items[0]).toHaveTextContent('Klijent je odustao.')
    expect(items[1]).toHaveTextContent('Klijent')
    expect(items[2]).toHaveTextContent('Sustav')
    expect(items[3]).toHaveTextContent('Ivana Babić')
    expect(items[3]).toHaveTextContent('09:15')
  })

  it('says when there are no changes yet', async () => {
    renderHistory([])
    expect(await screen.findByText('Još nema promjena statusa.')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    renderHistory('error')
    expect(await screen.findByText('Povijest nije moguće učitati.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokušaj ponovno' })).toBeInTheDocument()
  })
})
