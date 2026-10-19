import { beforeEach, describe, expect, it } from 'vitest'

import type {
  ClientSummaryPage,
  JobSummaryPage,
  LookupClientByPhone200,
  ValidationProblemDetails,
} from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { resetMockDb } from '../db'
import { loginAs, technicianId, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')

describe('client search', () => {
  it.each([
    ['durdevic', 'Tomislav Đurđević'],
    ['ĐURĐEVIĆ', 'Tomislav Đurđević'],
    ['simic', 'Marija Šimić'],
    ['culic vrbik', 'Ana Čulić'],
    ['091 210 0003', 'Tomislav Đurđević'],
    ['58210937461', 'Pekara Zlatno zrno d.o.o.'],
    ['samobor', 'Marija Šimić'],
  ])('%j finds %s (case- and diacritic-insensitive)', async (q, name) => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const page = (await s.get<ClientSummaryPage>(`/clients?q=${encodeURIComponent(q)}`)).body
    expect(page.items.map((c) => c.name)).toEqual([name])
  })

  it('filters by type and pages with totals', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const companies = (await s.get<ClientSummaryPage>('/clients?type=company')).body
    expect(companies.items.every((c) => c.type === 'company')).toBe(true)

    const first = (await s.get<ClientSummaryPage>('/clients?pageSize=4&page=1&sort=name')).body
    const last = (await s.get<ClientSummaryPage>('/clients?pageSize=4&page=4&sort=name')).body
    expect(first).toMatchObject({ page: 1, pageSize: 4, totalCount: 15 })
    expect(first.items).toHaveLength(4)
    expect(last.items).toHaveLength(3)
    expect(first.items[0]?.name).toBe('Ana Čulić')

    const desc = (await s.get<ClientSummaryPage>('/clients?sort=-name&pageSize=1')).body
    expect(desc.items[0]?.name).toBe('Ured Horizont d.o.o.')
  })
})

describe('phone lookup', () => {
  it.each(['091 210 0003', '0912100003', '+385 91 210 0003', '00385912100003', '+385912100003'])(
    'normalises %j to E.164 and finds the client with locations and equipment',
    async (phone) => {
      const s = await loginAs(USERS.alarmkoDispatcher)
      const response = await s.get<LookupClientByPhone200>(
        `/clients/lookup?phone=${encodeURIComponent(phone)}`,
      )
      expect(response.status).toBe(200)
      expect(response.body.normalizedPhone).toBe('+385912100003')
      expect(response.body.matches.map((c) => c.name)).toEqual(['Tomislav Đurđević'])
      expect(response.body.matches[0]?.locations[0]?.assets).toHaveLength(1)
    },
  )

  it('returns no matches for an unknown valid number', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const response = await s.get<LookupClientByPhone200>('/clients/lookup?phone=098%20765%204321')
    expect(response.body).toEqual({ normalizedPhone: '+385987654321', matches: [] })
  })

  it('rejects something that is not a phone number (400 on phone)', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const response = await s.get<ValidationProblemDetails>('/clients/lookup?phone=12')
    expect(response.status).toBe(400)
    expect(response.body.errors).toHaveProperty('phone')
  })
})

describe('job list filters and sorting', () => {
  it('filters by several statuses', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const page = (await s.get<JobSummaryPage>('/jobs?status=new&status=on_hold')).body
    expect(page.totalCount).toBe(4)
    expect(new Set(page.items.map((j) => j.status))).toEqual(new Set(['new', 'on_hold']))
  })

  it('filters unscheduled jobs and a date range', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const unscheduled = (await s.get<JobSummaryPage>('/jobs?unscheduled=true')).body
    expect(unscheduled.items.every((j) => j.scheduledDate === null)).toBe(true)
    expect(unscheduled.totalCount).toBe(3)

    const todays = (await s.get<JobSummaryPage>(`/jobs?from=${today()}&to=${today()}`)).body
    expect(todays.items.every((j) => j.scheduledDate === today())).toBe(true)
    expect(todays.totalCount).toBe(6)
  })

  it('refuses unscheduled together with from/to (400)', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    expect((await s.get(`/jobs?unscheduled=true&from=${today()}`)).status).toBe(400)
  })

  it('filters by technician', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const ivan = technicianId('alarmko', USERS.ivan)
    const page = (await s.get<JobSummaryPage>(`/jobs?technicianId=${ivan}`)).body
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((j) => j.technicians.some((t) => t.id === ivan))).toBe(true)
  })

  it('sorts by priority by importance, and by scheduled start with unscheduled last', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const byPriority = (await s.get<JobSummaryPage>('/jobs?sort=-priority&pageSize=200')).body.items
    expect(byPriority[0]?.priority).toBe('urgent')
    expect(byPriority.at(-1)?.priority).toBe('normal')

    const byStart = (await s.get<JobSummaryPage>('/jobs?sort=scheduledStart&pageSize=200')).body
      .items
    const starts = byStart.map((j) => j.scheduledStart).filter(Boolean)
    expect(starts).toEqual([...starts].sort())
    expect(byStart.at(-1)?.scheduledStart).toBeNull()
  })

  it('searches number, title, client and address without diacritics', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    expect((await s.get<JobSummaryPage>('/jobs?q=durdevic')).body.totalCount).toBe(1)
    expect((await s.get<JobSummaryPage>('/jobs?q=tkalciceva')).body.items[0]?.client.name).toBe(
      'Restoran Gornji grad d.o.o.',
    )
  })
})
