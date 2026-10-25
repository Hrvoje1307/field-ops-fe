import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import type { Job, TechnicianDay } from '@/shared/api/generated/model'
import { server } from '@/shared/api/mocks/node'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'

import { FieldDay } from './field-day'

const API = 'http://localhost/api/v1'
const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const

const job = (overrides: Partial<Job> & Pick<Job, 'id' | 'title'>): Job =>
  ({
    number: `RN-${overrides.id}`,
    status: 'scheduled',
    priority: 'normal',
    jobType: { id: 'jt', name: 'Servis', color: '#336699' },
    client: { id: 'c', name: 'Klijent' },
    location: { id: 'l', address: 'Ulica 1, Grad', lat: null, lng: null },
    clientDetail: {
      contacts: [
        { id: 'k1', name: 'Drugi', phone: '+385911111111', isPrimary: false, receivesSms: true },
        { id: 'k2', name: 'Glavni', phone: '+385922222222', isPrimary: true, receivesSms: true },
      ],
    },
    ...overrides,
  }) as unknown as Job

async function renderDay(jobs: Job[], date = '2026-10-28') {
  const requested: string[] = []
  server.use(
    http.get(`${API}/me/jobs`, ({ request }) => {
      requested.push(new URL(request.url).searchParams.get('date') ?? '')
      const day: TechnicianDay = {
        date,
        technician: { id: 't', fullName: 'Petra', color: '#db2777' },
        jobs,
      }
      return HttpResponse.json(day)
    }),
  )
  const onDateChange = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(<FieldDay date={date} onDateChange={onDateChange} />, {
    wrap: (children) => (
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={ZAGREB}>{children}</TenantFormatProvider>
      </QueryClientProvider>
    ),
  })
  return { requested, onDateChange, user: userEvent.setup() }
}

describe('FieldDay', () => {
  it('lists the jobs in the order given, with the time in the tenant zone', async () => {
    await renderDay([
      job({ id: '1', title: 'Prvi', scheduledStart: '2026-10-28T07:00:00Z' }),
      job({ id: '2', title: 'Drugi posao', scheduledStart: '2026-10-28T09:30:00Z' }),
      job({ id: '3', title: 'Bez vremena' }),
    ])
    const cards = await screen.findAllByTestId('field-job')
    expect(cards.map((card) => within(card).getAllByRole('link')[0]?.textContent)).toEqual([
      'Prvi',
      'Drugi posao',
      'Bez vremena',
    ])
    // 28 October: Zagreb is UTC+1
    expect(cards[0]).toHaveTextContent('08:00')
    expect(cards[1]).toHaveTextContent('10:30')
    expect(cards[2]).toHaveTextContent('Bez vremena')
    expect(screen.getByText('3 naloga')).toBeInTheDocument()
  })

  it('call goes to the primary contact; navigation to the maps with the address', async () => {
    await renderDay([job({ id: '1', title: 'Prvi' })])
    const card = await screen.findByTestId('field-job')
    expect(within(card).getByRole('link', { name: 'Nazovi Glavni' })).toHaveAttribute(
      'href',
      'tel:+385922222222',
    )
    const navigation = within(card).getByRole('link', { name: 'Navigacija' })
    expect(navigation.getAttribute('href')).toContain('google.com/maps')
    expect(new URL(navigation.getAttribute('href') ?? '').searchParams.get('destination')).toBe(
      'Ulica 1, Grad',
    )
    expect(navigation).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('an empty day says so; the arrows move the date', async () => {
    const { user, onDateChange, requested } = await renderDay([])
    expect(await screen.findByText('Nemate naloga za ovaj dan.')).toBeInTheDocument()
    expect(requested).toEqual(['2026-10-28'])
    await user.click(screen.getByRole('button', { name: 'Sljedeći dan' }))
    expect(onDateChange).toHaveBeenLastCalledWith('2026-10-29')
    await user.click(screen.getByRole('button', { name: 'Prethodni dan' }))
    expect(onDateChange).toHaveBeenLastCalledWith('2026-10-27')
  })

  it('shows an error with a retry', async () => {
    server.use(http.get(`${API}/me/jobs`, () => HttpResponse.json({ title: 'x' }, { status: 500 })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await renderInRouter(<FieldDay date="2026-10-28" onDateChange={() => undefined} />, {
      wrap: (children) => (
        <QueryClientProvider client={queryClient}>
          <TenantFormatProvider settings={ZAGREB}>{children}</TenantFormatProvider>
        </QueryClientProvider>
      ),
    })
    expect(await screen.findByText('Dan nije moguće učitati.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokušaj ponovno' })).toBeInTheDocument()
  })
})
