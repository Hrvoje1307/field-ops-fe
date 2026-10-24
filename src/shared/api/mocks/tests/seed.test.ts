import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobStatus } from '@/shared/api/generated/model'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'

import { getDb, resetMockDb } from '../db'
import type { MockDb } from '../db/rows'
import { MOCK_DB_STORAGE_KEY } from '../db/storage'
import { TRANSITIONS } from '../lib/job-machine'
import { buildSeed } from '../seed'
import { tenantBySlug } from './client'

const ALL_STATUSES: JobStatus[] = [
  'new',
  'scheduled',
  'confirmed',
  'en_route',
  'on_site',
  'on_hold',
  'completed',
  'invoiced',
  'cancelled',
]

beforeEach(() => {
  resetMockDb()
})

afterEach(() => {
  vi.useRealTimers()
})

describe.each(['alarmko', 'bura-klima'])('seed: %s', (slug) => {
  const t = () => tenantBySlug(slug)
  const today = () => todayInTimeZone('Europe/Zagreb')

  it('has about 15 clients and 18 jobs across every status', () => {
    expect(t().clients).toHaveLength(15)
    expect(t().jobs).toHaveLength(18)
    expect(new Set(t().jobs.map((j) => j.status))).toEqual(new Set(ALL_STATUSES))
  })

  it('gives every technician jobs today, and has jobs tomorrow and unscheduled', () => {
    for (const technician of t().technicians) {
      const todays = t().jobs.filter(
        (j) =>
          j.scheduledDate === today() &&
          t().assignments.some((a) => a.jobId === j.id && a.technicianId === technician.id),
      )
      expect(todays.length, `today's jobs of ${technician.id}`).toBeGreaterThan(0)
    }
    expect(t().jobs.some((j) => j.scheduledDate === addDays(today(), 1))).toBe(true)
    expect(
      t().jobs.filter((j) => j.status === 'new' && j.scheduledDate === null).length,
    ).toBeGreaterThanOrEqual(3)
  })

  it('has clients with several locations, equipment and access notes', () => {
    const locationsPerClient = t().clients.map(
      (c) => t().locations.filter((l) => l.clientId === c.id).length,
    )
    expect(locationsPerClient.some((n) => n > 1)).toBe(true)
    expect(t().assets.length).toBeGreaterThan(5)
    expect(t().locations.filter((l) => l.accessNotes).length).toBeGreaterThanOrEqual(3)
  })

  it('only contains history allowed by the status machine, ending in the current status', () => {
    for (const job of t().jobs) {
      const steps = t().history.filter((h) => h.jobId === job.id)
      expect(steps[0]?.fromStatus).toBeNull()
      expect(steps[0]?.toStatus).toBe('new')
      for (const step of steps.slice(1)) {
        expect(step.fromStatus).not.toBeNull()
        expect(
          TRANSITIONS[step.fromStatus ?? 'new'],
          `${String(step.fromStatus)} → ${step.toStatus}`,
        ).toContain(step.toStatus)
      }
      expect(steps.at(-1)?.toStatus).toBe(job.status)
    }
  })

  it('numbers jobs uniquely with the tenant prefix', () => {
    const prefix = t().tenant.settings.jobNumberPrefix ?? 'RN'
    const numbers = t().jobs.map((j) => j.number)
    expect(new Set(numbers).size).toBe(numbers.length)
    for (const number of numbers) expect(number).toMatch(new RegExp(`^${prefix}-\\d{4}-\\d{4}$`))
  })
})

describe('tenants', () => {
  it('are two different industries with their own configuration', () => {
    const alarm = tenantBySlug('alarmko')
    const hvac = tenantBySlug('bura-klima')
    expect(alarm.jobTypes.map((j) => j.name)).not.toEqual(hvac.jobTypes.map((j) => j.name))
    expect(alarm.customFields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['zones', 'monitoring_contract', 'alarm_code']),
    )
    expect(hvac.customFields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['refrigerant', 'power_kw', 'last_fgas_check']),
    )
    expect(alarm.technicians).toHaveLength(3)
    expect(hvac.technicians).toHaveLength(2)
  })
})

describe('persistence', () => {
  it('builds the same ids for the same day', () => {
    const a = buildSeed('2026-10-19')
    const b = buildSeed('2026-10-19')
    expect(Object.keys(a.tenants)).toEqual(Object.keys(b.tenants))
    expect(a.users.map((u) => u.id)).toEqual(b.users.map((u) => u.id))
  })

  it('stores the database in localStorage', () => {
    const stored = JSON.parse(localStorage.getItem(MOCK_DB_STORAGE_KEY) ?? '{}') as {
      seedDate?: string
    }
    expect(stored.seedDate).toBe(getDb().seedDate)
  })

  it('reloads when another tab saved the database (storage event)', () => {
    getDb()
    // Another tab changes a client name and saves
    const stored = JSON.parse(localStorage.getItem(MOCK_DB_STORAGE_KEY) ?? '{}') as MockDb
    const tenantId = Object.keys(stored.tenants)[0] ?? ''
    const client = stored.tenants[tenantId]?.clients[0]
    if (client) client.name = 'Promijenjeno u drugoj kartici'
    localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(stored))
    window.dispatchEvent(
      new StorageEvent('storage', { key: MOCK_DB_STORAGE_KEY, storageArea: localStorage }),
    )

    expect(getDb().tenants[tenantId]?.clients[0]?.name).toBe('Promijenjeno u drugoj kartici')
  })

  it('reseeds when the stored seed date is not today', () => {
    const db = getDb()
    db.loginThrottle.push({ email: 'x@test', failures: [], lockedUntil: '2999-01-01T00:00:00Z' })
    // The next day arrives
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 24 * 3_600_000))

    const next = getDb()
    expect(next.seedDate).toBe(addDays(db.seedDate, 1))
    expect(next.loginThrottle).toEqual([])
  })
})
