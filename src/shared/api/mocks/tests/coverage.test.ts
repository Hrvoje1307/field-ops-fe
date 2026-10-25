/**
 * Calls every mocked operation at least once through the contract-checking
 * client (success path, plus the main conflict paths), and fails if a handler
 * is never called. A new mocked endpoint without a test breaks CI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type {
  AssetType,
  Client,
  CustomFieldDefinition,
  Depot,
  Invitation,
  Job,
  JobType,
  Location,
  Asset,
  ProblemDetails,
  Skill,
  Technician,
  TokenResponse,
} from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { getDb, resetMockDb } from '../db'
import { handlers } from '../handlers'
import { newId } from '../lib/ids'
import {
  api,
  API_URL,
  calledOperations,
  clientId,
  loginAs,
  sessionFor,
  tenantBySlug,
  USERS,
  type Session,
} from './client'

const today = () => todayInTimeZone('Europe/Zagreb')

let owner: Session

beforeAll(async () => {
  resetMockDb()
  owner = await loginAs(USERS.alarmkoOwner)
})

afterAll(() => {
  const mocked = handlers.map(
    (h) =>
      `${String(h.info.method)} ${String(h.info.path)
        .replace(API_URL, '')
        .replace(/:(\w+)/g, '{$1}')}`,
  )
  expect(mocked.filter((operation) => !calledOperations.has(operation))).toEqual([])
})

describe('every mocked operation matches the contract', () => {
  it('dispatch', async () => {
    const board = await owner.get<{ columns: unknown[] }>(`/dispatch/board?date=${today()}`)
    expect(board.status).toBe(200)
    expect(board.body.columns.length).toBeGreaterThan(0)
  })

  it('auth', async () => {
    const tokens = (
      await api<TokenResponse>('post', '/auth/login', {
        body: { email: USERS.ana, password: 'demo' },
      })
    ).body
    const rotated = (
      await api<TokenResponse>('post', '/auth/refresh', {
        body: { refreshToken: tokens.refreshToken },
      })
    ).body
    const ana = sessionFor(rotated)
    expect((await ana.get('/me')).status).toBe(200)
    const switched = await ana.post<TokenResponse>('/auth/switch-tenant', {
      tenantId: tenantBySlug('bura-klima').tenant.id,
    })
    expect(switched.status).toBe(200)
    expect((await ana.post('/auth/logout', { refreshToken: rotated.refreshToken })).status).toBe(
      204,
    )
    expect(
      (await api('post', '/auth/password/forgot', { body: { email: USERS.ana } })).status,
    ).toBe(202)
  })

  it('tenant settings, depots, skills, members and invitations', async () => {
    const t = tenantBySlug('alarmko')
    expect((await owner.get('/tenant')).status).toBe(200)
    expect(
      (
        await owner.put('/tenant', {
          name: t.tenant.name,
          oib: t.tenant.oib,
          locale: t.tenant.locale,
          timezone: t.tenant.timezone,
          currency: t.tenant.currency,
          settings: t.tenant.settings,
        })
      ).status,
    ).toBe(200)
    expect((await owner.get(`/tenant/usage?month=${today().slice(0, 7)}`)).status).toBe(200)

    // Depots
    expect((await owner.get('/depots')).status).toBe(200)
    const depot = (
      await owner.post<Depot>('/depots', {
        name: 'Skladište Sesvete',
        address: 'Sesvete',
        opensAt: '07:00',
        closesAt: '15:00',
      })
    ).body
    expect(
      (await owner.put(`/depots/${depot.id}`, { ...depot, name: 'Skladište Sesvete 2' })).status,
    ).toBe(200)
    expect((await owner.del(`/depots/${depot.id}`)).status).toBe(204)
    expect((await owner.del<ProblemDetails>(`/depots/${t.depots[0]?.id ?? ''}`)).status).toBe(409) // technicians use it

    // Skills
    expect((await owner.get('/skills')).status).toBe(200)
    const skill = (await owner.post<Skill>('/skills', { name: 'Vatrodojava' })).body
    expect((await owner.post('/skills', { name: 'vatrodojava' })).status).toBe(409)
    expect((await owner.put(`/skills/${skill.id}`, { name: 'Vatrodojavni sustavi' })).status).toBe(
      200,
    )
    expect((await owner.del(`/skills/${skill.id}`)).status).toBe(204)

    // Members and invitations
    expect((await owner.get('/users')).status).toBe(200)
    const luka = getDb().users.find((u) => u.email === USERS.luka)?.id ?? ''
    expect((await owner.put(`/users/${luka}`, { role: 'technician', isActive: true })).status).toBe(
      200,
    )
    expect((await owner.get('/users/invitations')).status).toBe(200)
    const invitation = (
      await owner.post<Invitation>('/users/invitations', {
        email: 'nova@alarmko.test',
        role: 'dispatcher',
      })
    ).body
    expect(
      (await owner.post('/users/invitations', { email: 'nova@alarmko.test', role: 'dispatcher' }))
        .status,
    ).toBe(409)
    expect((await owner.del(`/users/invitations/${invitation.id}`)).status).toBe(204)
  })

  it('technicians', async () => {
    const t = tenantBySlug('alarmko')
    // A new technician member (invite acceptance isn't mocked yet)
    const db = getDb()
    const userId = newId()
    db.users.push({
      id: userId,
      email: 'novi@alarmko.test',
      fullName: 'Novi Tehničar',
      phone: null,
      password: 'demo',
      lastTenantId: t.tenant.id,
      lastLoginAt: null,
    })
    db.memberships.push({ tenantId: t.tenant.id, userId, role: 'technician', isActive: true })

    const input = {
      userId,
      depotId: t.depots[0]?.id ?? null,
      color: '#a855f7',
      workStart: '07:00',
      workEnd: '15:00',
      workingDays: [1, 2, 3, 4, 5],
      skillIds: [t.skills[0]?.id],
      isActive: true,
    }
    const created = await owner.post<Technician>('/technicians', input)
    expect(created.status).toBe(201)
    expect((await owner.post('/technicians', input)).status).toBe(400) // already a technician
    expect(
      (await owner.put(`/technicians/${created.body.id}`, { ...input, color: '#7e22ce' })).status,
    ).toBe(200)
    expect((await owner.get(`/technicians/${created.body.id}`)).status).toBe(200)
    expect(
      (await owner.get(`/technicians/${created.body.id}/schedule?date=${today()}`)).status,
    ).toBe(200)
    expect((await owner.get('/technicians')).status).toBe(200)
  })

  it('clients, locations, equipment and asset types', async () => {
    const created = await owner.post<Client>('/clients', {
      type: 'company',
      name: 'Galerija Kvadrat d.o.o.',
      contacts: [{ name: 'Iva Kos', phone: '091 300 5000' }],
      customFields: { monitoring_contract: 'standard' },
      firstLocation: { street: 'Ilica 5', city: 'Zagreb' },
    })
    expect(created.status).toBe(201)
    const client = created.body
    expect((await owner.get('/clients')).status).toBe(200)
    expect((await owner.get('/clients/lookup?phone=0913005000')).status).toBe(200)
    expect((await owner.get(`/clients/${client.id}`)).status).toBe(200)
    expect(
      (
        await owner.put(`/clients/${client.id}`, {
          type: client.type,
          name: client.name,
          contacts: client.contacts,
          customFields: client.customFields,
          version: client.version,
        })
      ).status,
    ).toBe(200)

    // Locations
    expect((await owner.get(`/clients/${client.id}/locations`)).status).toBe(200)
    const location = (
      await owner.post<Location>(`/clients/${client.id}/locations`, {
        label: 'Skladište',
        street: 'Radnička cesta 1',
        city: 'Zagreb',
        accessCodes: '1111',
      })
    ).body
    expect((await owner.get(`/locations/${location.id}`)).status).toBe(200)
    expect(
      (await owner.put(`/locations/${location.id}`, { street: 'Radnička cesta 2', city: 'Zagreb' }))
        .status,
    ).toBe(200)
    expect((await owner.post('/geocode', { street: 'Ilica 5', city: 'Zagreb' })).status).toBe(200)

    // Equipment
    const panel = tenantBySlug('alarmko').assetTypes.find((a) => a.name === 'Alarmna centrala')?.id
    expect((await owner.get(`/locations/${location.id}/assets`)).status).toBe(200)
    const asset = (
      await owner.post<Asset>(`/locations/${location.id}/assets`, {
        assetTypeId: panel,
        customFields: { zones: 4 },
      })
    ).body
    expect((await owner.get(`/assets/${asset.id}`)).status).toBe(200)
    expect(
      (
        await owner.put(`/assets/${asset.id}`, {
          assetTypeId: panel,
          model: 'SP4000',
          customFields: { zones: 6 },
        })
      ).status,
    ).toBe(200)
    expect((await owner.del(`/assets/${asset.id}`)).status).toBe(204)
    expect((await owner.del(`/locations/${location.id}`)).status).toBe(204)

    // Asset types
    expect((await owner.get('/asset-types')).status).toBe(200)
    const assetType = (
      await owner.post<AssetType>('/asset-types', { name: 'Vatrodojavna centrala', icon: 'flame' })
    ).body
    expect(
      (await owner.put(`/asset-types/${assetType.id}`, { name: 'Vatrodojava', icon: null })).status,
    ).toBe(200)
    expect((await owner.del(`/asset-types/${assetType.id}`)).status).toBe(204)
    expect((await owner.del(`/asset-types/${panel ?? ''}`)).status).toBe(409) // panels exist

    // Delete: blocked by open jobs, allowed without
    const busy = clientId('alarmko', 'Tomislav Đurđević')
    const busyLocation =
      tenantBySlug('alarmko').locations.find((l) => l.clientId === busy)?.id ?? ''
    expect((await owner.del(`/clients/${busy}`)).status).toBe(409)
    expect((await owner.del(`/locations/${busyLocation}`)).status).toBe(409)
    expect((await owner.del(`/clients/${client.id}`)).status).toBe(204)
  })

  it('jobs and the technician day', async () => {
    const t = tenantBySlug('alarmko')
    const client = clientId('alarmko', 'Lucija Matić')
    const created = await owner.post<Job>('/jobs', {
      clientId: client,
      locationId: t.locations.find((l) => l.clientId === client)?.id,
      jobTypeId: t.jobTypes.find((jt) => jt.name === 'Servis')?.id,
      title: 'Kontrolni servis',
    })
    expect(created.status).toBe(201)
    const job = created.body
    expect((await owner.get('/jobs')).status).toBe(200)
    expect((await owner.get(`/jobs/${job.id}`)).status).toBe(200)
    const updated = await owner.put<Job>(`/jobs/${job.id}`, {
      clientId: job.client.id,
      locationId: job.location.id,
      jobTypeId: job.jobType.id,
      title: 'Kontrolni servis — hitno',
      priority: 'high',
      version: job.version,
    })
    expect(updated.status).toBe(200)
    const assigned = await owner.post<Job>(`/jobs/${job.id}/assign`, {
      technicianIds: [t.technicians[0]?.id],
      scheduledDate: today(),
      version: updated.body.version,
    })
    expect(assigned.body.status).toBe('scheduled')
    expect((await owner.post(`/jobs/${job.id}/transition`, { to: 'confirmed' })).status).toBe(200)
    expect((await owner.get(`/jobs/${job.id}/history`)).status).toBe(200)

    const ivan = await loginAs(USERS.ivan)
    expect((await ivan.get(`/me/jobs?date=${today()}`)).status).toBe(200)
  })

  it('configuration: job types and custom fields', async () => {
    const t = tenantBySlug('alarmko')
    expect((await owner.get('/job-types')).status).toBe(200)
    const input = {
      name: 'Vatrodojava servis',
      color: '#be123c',
      defaultDurationMin: 60,
      requiredPeople: 1,
      requiredSkillIds: [],
      smsEnabled: true,
      isActive: true,
    }
    const jobType = (await owner.post<JobType>('/job-types', input)).body
    expect(
      (await owner.put(`/job-types/${jobType.id}`, { ...input, defaultDurationMin: 90 })).status,
    ).toBe(200)
    expect((await owner.del(`/job-types/${jobType.id}`)).status).toBe(204)
    expect((await owner.del(`/job-types/${t.jobTypes[0]?.id ?? ''}`)).status).toBe(409) // jobs use it

    expect((await owner.get('/custom-fields?entity=client')).status).toBe(200)
    const fieldInput = {
      entity: 'job',
      key: 'gate_remote',
      label: 'Daljinski za vrata',
      type: 'checkbox',
      required: false,
      isSensitive: false,
      sortOrder: 10,
    }
    const field = (await owner.post<CustomFieldDefinition>('/custom-fields', fieldInput)).body
    expect((await owner.post('/custom-fields', fieldInput)).status).toBe(409) // duplicate key
    expect(
      (
        await owner.put(`/custom-fields/${field.id}`, {
          ...fieldInput,
          label: 'Daljinski upravljač',
        })
      ).status,
    ).toBe(200)
    expect(
      (await owner.put(`/custom-fields/${field.id}`, { ...fieldInput, type: 'text' })).status,
    ).toBe(422) // immutable
    expect((await owner.del(`/custom-fields/${field.id}`)).status).toBe(204)
  })
})
