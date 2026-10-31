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
  RoutePlan,
  Skill,
  Technician,
  TokenResponse,
} from '@/shared/api/generated/model'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'

import { getDb, resetMockDb } from '../db'
import { handlers } from '../handlers'
import { newId } from '../lib/ids'
import { isoWeekday } from '../lib/visit-order'
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
  // The mock's object storage is outside the contract (the real one is S3)
  expect(
    mocked.filter(
      (operation) => !operation.includes('/mock-storage/') && !calledOperations.has(operation),
    ),
  ).toEqual([])
})

describe('every mocked operation matches the contract', () => {
  it('dispatch', async () => {
    const board = await owner.get<{ columns: unknown[] }>(`/dispatch/board?date=${today()}`)
    expect(board.status).toBe(200)
    expect(board.body.columns.length).toBeGreaterThan(0)
  })

  it('route plans: optimize, read, correct, publish', async () => {
    const t = tenantBySlug('alarmko')
    const technician = t.technicians.find((row) => row.isActive)
    const job = t.jobs.find((row) => row.status === 'new' && !row.deletedAt)
    if (!technician || !job) throw new Error('Seed needs a technician and a new job')
    let date = addDays(today(), 1)
    while (isoWeekday(date) > 5) date = addDays(date, 1)
    const plan = await owner.post<RoutePlan>('/route-plans/optimize', {
      date,
      technicianIds: [technician.id],
      jobIds: [job.id],
    })
    expect(plan.status).toBe(201)
    expect((await owner.get(`/route-plans/${plan.body.id}`)).status).toBe(200)
    expect(
      (
        await owner.put(`/route-plans/${plan.body.id}`, {
          routes: plan.body.routes.map((r) => ({
            technicianId: r.technicianId,
            jobIds: r.stops.map((stop) => stop.jobId),
          })),
        })
      ).status,
    ).toBe(200)
    expect((await owner.post(`/route-plans/${plan.body.id}/publish`)).status).toBe(200)
  })

  it('reports: report, checklist, materials, catalog, files, signature, complete, print', async () => {
    const t = tenantBySlug('alarmko')
    const job = t.jobs.find((row) => row.status === 'on_site')
    if (!job) throw new Error('Seed needs an on_site job')
    const ivan = await loginAs(USERS.ivan)
    const base = `/jobs/${job.id}`
    expect((await ivan.get(`${base}/report`)).status).toBe(200)
    expect((await ivan.put(`${base}/report`, { workDone: 'Gotovo.' })).status).toBe(200)
    const list = (await ivan.get<{ id: string }[]>(`${base}/checklist`)).body
    expect(
      (
        await ivan.put(
          `${base}/checklist`,
          list.map((item) => ({ id: item.id, isDone: true })),
        )
      ).status,
    ).toBe(200)
    const catalog = (await ivan.get<{ items: { id: string }[] }>('/catalog-items')).body
    const material = await ivan.post<{ id: string }>(`${base}/materials`, {
      catalogItemId: catalog.items[0]?.id,
      quantity: '1',
    })
    expect(material.status).toBe(201)
    expect((await ivan.get(`${base}/materials`)).status).toBe(200)
    expect((await ivan.del(`${base}/materials/${material.body.id}`)).status).toBe(204)

    const png = new Uint8Array([137, 80, 78, 71])
    const target = await ivan.post<{
      attachmentId: string
      uploadUrl: string
      headers: Record<string, string>
    }>('/attachments/upload-url', {
      ownerType: 'job',
      ownerId: job.id,
      kind: 'signature',
      mime: 'image/png',
      sizeBytes: png.byteLength,
    })
    expect(target.status).toBe(201)
    await fetch(target.body.uploadUrl, {
      method: 'PUT',
      headers: target.body.headers,
      body: png as unknown as BodyInit,
    })
    const id = target.body.attachmentId
    expect((await ivan.post('/attachments', { attachmentId: id })).status).toBe(200)
    expect((await ivan.get(`/attachments?ownerType=job&ownerId=${job.id}`)).status).toBe(200)
    expect((await ivan.get(`/attachments/${id}/url`)).status).toBe(200)
    expect(
      (await ivan.post(`${base}/signature`, { attachmentId: id, signedByName: 'Marko' })).status,
    ).toBe(200)
    expect((await ivan.get(`${base}/report/print`)).status).toBe(200)
    expect((await ivan.post(`${base}/complete`, { sendReportToClient: false })).status).toBe(200)
    expect((await ivan.del(`/attachments/${id}`)).status).toBe(204)
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
    db.memberships.push({
      tenantId: t.tenant.id,
      userId,
      role: 'technician',
      isActive: true,
      canAccessSales: false,
    })

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

    expect((await owner.get('/checklist-templates')).status).toBe(200)
    const template = (
      await owner.post<{ id: string }>('/checklist-templates', {
        name: 'Zatvaranje',
        items: [{ label: 'Pokupiti alat' }],
      })
    ).body
    expect(
      (
        await owner.put(`/checklist-templates/${template.id}`, {
          name: 'Zatvaranje',
          items: [{ label: 'Pokupiti alat', required: true }],
        })
      ).status,
    ).toBe(200)
    expect((await owner.del(`/checklist-templates/${template.id}`)).status).toBe(204)

    expect((await owner.get('/message-templates')).status).toBe(200)
    const message = {
      key: 'reschedule_ack',
      channel: 'sms',
      locale: 'hr-HR',
      body: 'Termin je promijenjen.',
      isActive: true,
    }
    const messageTemplate = (await owner.post<{ id: string }>('/message-templates', message)).body
    expect((await owner.post('/message-templates', message)).status).toBe(409) // already written
    expect(
      (await owner.put(`/message-templates/${messageTemplate.id}`, { ...message, isActive: false }))
        .status,
    ).toBe(200)
    expect((await owner.post('/message-templates/preview', { body: 'Bok {klijent}' })).status).toBe(
      200,
    )
    expect((await owner.del(`/message-templates/${messageTemplate.id}`)).status).toBe(204)

    // Messages and the client's page
    const jobForMessages = t.jobs.find(
      (j) =>
        j.status === 'scheduled' &&
        j.scheduledDate &&
        t.contacts.some((c) => c.clientId === j.clientId && c.phone && c.receivesSms),
    )
    expect((await owner.get('/messages')).status).toBe(200)
    expect(
      (
        await owner.post(`/jobs/${jobForMessages?.id ?? ''}/notify`, {
          channel: 'sms',
          templateKey: 'on_the_way',
        })
      ).status,
    ).toBe(202)
    const publicToken = jobForMessages?.publicToken ?? ''
    expect((await owner.get(`/public/jobs/${publicToken}`)).status).toBe(200)
    expect((await owner.post(`/public/jobs/${publicToken}/confirm`)).status).toBe(200)
    expect((await owner.post(`/public/jobs/${publicToken}/reschedule-request`, {})).status).toBe(
      202,
    )

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
