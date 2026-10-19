/**
 * Contract sweep: every read endpoint, both tenants, all roles. The test client
 * validates each response against its OpenAPI schema.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import type { ClientSummaryPage, JobSummaryPage, Me } from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { resetMockDb } from '../db'
import { contractViolations } from './contract'
import { loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')

describe.each([
  ['alarmko', USERS.alarmkoOwner],
  ['alarmko', USERS.alarmkoDispatcher],
  ['bura-klima', USERS.buraOwner],
  ['bura-klima', USERS.buraDispatcher],
])('office read endpoints match the contract (%s, %s)', (slug, email) => {
  it('lists and details', async () => {
    const s = await loginAs(email, slug)
    const t = tenantBySlug(slug)

    for (const path of [
      '/me',
      '/tenant',
      `/tenant/usage?month=${today().slice(0, 7)}`,
      '/depots',
      '/skills',
      '/users',
      '/users/invitations',
      '/technicians?includeInactive=true',
      '/asset-types',
      '/job-types',
      '/custom-fields',
      '/custom-fields?entity=asset',
      '/clients?pageSize=200',
      '/jobs?pageSize=200',
      '/jobs?unscheduled=true',
      `/jobs?from=${today()}&to=${today()}&sort=scheduledStart`,
    ]) {
      expect((await s.get(path)).status, path).toBe(200)
    }

    for (const technician of t.technicians) {
      expect((await s.get(`/technicians/${technician.id}`)).status).toBe(200)
      expect((await s.get(`/technicians/${technician.id}/schedule?date=${today()}`)).status).toBe(
        200,
      )
    }
    for (const client of t.clients) {
      expect((await s.get(`/clients/${client.id}`)).status).toBe(200)
      expect((await s.get(`/clients/${client.id}/locations`)).status).toBe(200)
    }
    for (const location of t.locations) {
      expect((await s.get(`/locations/${location.id}`)).status).toBe(200)
      expect((await s.get(`/locations/${location.id}/assets`)).status).toBe(200)
    }
    for (const asset of t.assets) expect((await s.get(`/assets/${asset.id}`)).status).toBe(200)
    for (const job of t.jobs) {
      expect((await s.get(`/jobs/${job.id}`)).status).toBe(200)
      expect((await s.get(`/jobs/${job.id}/history`)).status).toBe(200)
    }
  })
})

describe.each([
  ['alarmko', USERS.petra],
  ['bura-klima', USERS.mia],
])('technician read endpoints match the contract (%s, %s)', (slug, email) => {
  it('own day, own jobs, configuration', async () => {
    const s = await loginAs(email, slug)
    const me = (await s.get<Me>('/me')).body
    expect(me.technicianId).toBeTruthy()

    for (const path of [
      '/me',
      '/tenant',
      '/depots',
      '/skills',
      '/job-types',
      '/asset-types',
      '/custom-fields',
    ]) {
      expect((await s.get(path)).status, path).toBe(200)
    }
    expect((await s.get(`/me/jobs?date=${today()}`)).status).toBe(200)
    const jobs = (await s.get<JobSummaryPage>('/jobs?pageSize=200')).body
    for (const job of jobs.items) expect((await s.get(`/jobs/${job.id}`)).status).toBe(200)
  })
})

describe('the contract checker itself', () => {
  it('flags a body that drifted from the schema', () => {
    const drifted = { page: 1, pageSize: 50, totalCount: 1, items: [{ id: 'x', name: 'No type' }] }
    expect(
      contractViolations('get', '/clients', 200, 'application/json', drifted).length,
    ).toBeGreaterThan(0)
  })

  it('flags an undeclared status', () => {
    expect(contractViolations('get', '/tenant', 418, 'application/problem+json', {})).toEqual([
      'GET /tenant → 418 is not declared in the spec',
    ])
  })

  it('flags a wrong content type', () => {
    const page: ClientSummaryPage = { page: 1, pageSize: 50, totalCount: 0, items: [] }
    expect(contractViolations('get', '/clients', 200, 'text/plain', page)).toHaveLength(1)
  })

  it('accepts documented global errors', () => {
    expect(
      contractViolations(
        'get',
        '/locations/0190a1b2-0000-7000-8000-000000000001',
        404,
        'application/problem+json',
        {
          status: 404,
          title: 'Not found',
        },
      ),
    ).toEqual([])
  })
})
