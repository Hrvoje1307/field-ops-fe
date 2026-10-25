import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Attachment,
  CatalogItemPage,
  ChecklistItem,
  Job,
  JobMaterial,
  JobReport,
} from '@/shared/api/generated/model'
import { env } from '@/shared/config/env'

import { resetMockDb } from '../db'
import { loginAs, type Session, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

/** The job a technician is on site at (the seeded crew job of the alarm tenant). */
function onSiteJobId(slug = 'alarmko'): string {
  const job = tenantBySlug(slug).jobs.find((row) => row.status === 'on_site')
  if (!job) throw new Error('Seed needs an on_site job')
  return job.id
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3])

/** upload-url → PUT to the storage → confirm: a file attached to a job. */
async function attach(
  session: Session,
  jobId: string,
  kind: 'photo' | 'signature',
  bytes: Uint8Array = PNG,
  mime = 'image/png',
) {
  const target = await session.post<{
    attachmentId: string
    uploadUrl: string
    headers: Record<string, string>
  }>('/attachments/upload-url', {
    ownerType: 'job',
    ownerId: jobId,
    kind,
    fileName: `${kind}.png`,
    mime,
    sizeBytes: bytes.byteLength,
  })
  expect(target.status).toBe(201)
  const upload = await fetch(target.body.uploadUrl, {
    method: 'PUT',
    headers: target.body.headers,
    body: bytes as unknown as BodyInit,
  })
  expect(upload.status).toBe(200)
  const confirmed = await session.post<Attachment>('/attachments', {
    attachmentId: target.body.attachmentId,
  })
  expect(confirmed.status).toBe(200)
  return confirmed.body
}

describe('report', () => {
  it('is empty for a job that has none yet, and only for people who may see the job', async () => {
    const jobId = onSiteJobId()
    const ivan = await loginAs(USERS.ivan)
    const report = await ivan.get<JobReport>(`/jobs/${jobId}/report`)
    expect(report.status).toBe(200)
    expect(report.body).toMatchObject({ jobId, workDone: null, materials: [], photos: [] })
    expect(report.body.checklist.length).toBeGreaterThan(0)
    expect((await (await loginAs(USERS.petra)).get(`/jobs/${jobId}/report`)).status).toBe(404)
  })

  it('a technician saves the draft while on site, not before or after; the office until invoiced', async () => {
    const t = tenantBySlug('alarmko')
    const ivan = await loginAs(USERS.ivan)
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const jobId = onSiteJobId()
    const saved = await ivan.put<JobReport>(`/jobs/${jobId}/report`, {
      workDone: 'Ugrađeno.',
      labourMinutes: 90,
    })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ workDone: 'Ugrađeno.', labourMinutes: 90 })

    // An absent field keeps its value; null clears it
    const kept = await ivan.put<JobReport>(`/jobs/${jobId}/report`, { labourMinutes: null })
    expect(kept.body).toMatchObject({ workDone: 'Ugrađeno.', labourMinutes: null })

    const scheduled = t.jobs.find((row) => row.status === 'scheduled' && row.number)
    const invoiced = t.jobs.find((row) => row.status === 'invoiced')
    if (!scheduled || !invoiced) throw new Error('Seed needs both')
    const ivansJob = t.jobs.find(
      (row) =>
        row.status === 'scheduled' &&
        t.assignments.some((a) => a.jobId === row.id && a.technicianId === t.technicians[0]?.id),
    )
    if (ivansJob) {
      expect((await ivan.put(`/jobs/${ivansJob.id}/report`, { workDone: 'x' })).status).toBe(409)
    }
    expect((await dispatcher.put(`/jobs/${scheduled.id}/report`, { workDone: 'x' })).status).toBe(
      200,
    )
    expect((await dispatcher.put(`/jobs/${invoiced.id}/report`, { workDone: 'x' })).status).toBe(
      409,
    )
  })

  it('the end cannot be before the start', async () => {
    const ivan = await loginAs(USERS.ivan)
    const response = await ivan.put<{ errors: Record<string, string[]> }>(
      `/jobs/${onSiteJobId()}/report`,
      { startedAt: '2026-10-27T10:00:00Z', finishedAt: '2026-10-27T09:00:00Z' },
    )
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors)).toEqual(['finishedAt'])
  })
})

describe('checklist', () => {
  it('ticks and unticks items, with who and when; unknown items are refused', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const list = (await ivan.get<ChecklistItem[]>(`/jobs/${jobId}/checklist`)).body
    const item = list.find((candidate) => !candidate.isDone)
    if (!item) throw new Error('Seed needs an open item')

    const done = await ivan.put<ChecklistItem[]>(`/jobs/${jobId}/checklist`, [
      { id: item.id, isDone: true },
    ])
    expect(done.body.find((c) => c.id === item.id)).toMatchObject({
      isDone: true,
      doneByName: 'Ivan Horvat',
    })
    expect(done.body).toHaveLength(list.length)
    const undone = await ivan.put<ChecklistItem[]>(`/jobs/${jobId}/checklist`, [
      { id: item.id, isDone: false },
    ])
    expect(undone.body.find((c) => c.id === item.id)).toMatchObject({
      isDone: false,
      doneAt: null,
      doneByName: null,
    })

    const unknown = await ivan.put<{ errors: Record<string, string[]> }>(
      `/jobs/${jobId}/checklist`,
      [{ id: '00000000-0000-7000-8000-000000000000', isDone: true }],
    )
    expect(unknown.status).toBe(400)
    expect(Object.keys(unknown.body.errors)).toEqual(['[0].id'])
  })
})

describe('materials', () => {
  it('adds from the catalog or free-text, totals them, and deletes', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const catalog = (await ivan.get<CatalogItemPage>('/catalog-items?q=kabel')).body
    const cable = catalog.items[0]
    if (!cable) throw new Error('Seed needs a cable in the catalog')

    const fromCatalog = await ivan.post<JobMaterial>(`/jobs/${jobId}/materials`, {
      catalogItemId: cable.id,
      quantity: '12.5',
    })
    expect(fromCatalog.status).toBe(201)
    expect(fromCatalog.body).toMatchObject({
      name: cable.name,
      unit: cable.unit,
      unitPrice: cable.price,
      lineTotal: '8.13', // 12.5 × 0.65 = 8.125, rounded up
    })
    const free = await ivan.post<JobMaterial>(`/jobs/${jobId}/materials`, {
      name: 'Vijci',
      unit: 'kom',
      unitPrice: '0.10',
      quantity: '20',
    })
    expect(free.body.lineTotal).toBe('2.00')

    const report = (await ivan.get<JobReport>(`/jobs/${jobId}/report`)).body
    expect(report.materials).toHaveLength(2)
    expect(report.totalMaterials).toBe('10.13')

    expect((await ivan.del(`/jobs/${jobId}/materials/${free.body.id}`)).status).toBe(204)
    expect((await ivan.get<JobMaterial[]>(`/jobs/${jobId}/materials`)).body).toHaveLength(1)
    expect((await ivan.del(`/jobs/${jobId}/materials/${free.body.id}`)).status).toBe(404)
  })

  it('free-text needs a name and a unit; the quantity must be above zero', async () => {
    const ivan = await loginAs(USERS.ivan)
    const response = await ivan.post<{ errors: Record<string, string[]> }>(
      `/jobs/${onSiteJobId()}/materials`,
      { quantity: '0' },
    )
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors).sort()).toEqual(['name', 'quantity', 'unit'])
  })

  it("the catalog is the tenant's own, searchable, active items only by default", async () => {
    const alarmko = (await (await loginAs(USERS.ivan)).get<CatalogItemPage>('/catalog-items')).body
    const bura = (await (await loginAs(USERS.ante)).get<CatalogItemPage>('/catalog-items')).body
    expect(alarmko.items.map((i) => i.sku)).toContain('MK-01')
    expect(bura.items.map((i) => i.sku)).not.toContain('MK-01')
    expect(bura.items.map((i) => i.sku)).toContain('FIL-AC')
  })
})

describe('attachments', () => {
  it('a photo is uploaded, confirmed and then part of the report; it can be opened and deleted', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const photo = await attach(ivan, jobId, 'photo', PNG)
    expect(photo).toMatchObject({ kind: 'photo', ownerId: jobId, sizeBytes: PNG.byteLength })

    const report = (await ivan.get<JobReport>(`/jobs/${jobId}/report`)).body
    expect(report.photos.map((p) => p.id)).toEqual([photo.id])
    const list = await ivan.get<Attachment[]>(`/attachments?ownerType=job&ownerId=${jobId}`)
    expect(list.body.map((a) => a.id)).toEqual([photo.id])

    const url = await ivan.get<{ url: string }>(`/attachments/${photo.id}/url`)
    expect(url.body.url).toMatch(/^data:/)
    expect((await ivan.del(`/attachments/${photo.id}`)).status).toBe(204)
    expect((await ivan.get<JobReport>(`/jobs/${jobId}/report`)).body.photos).toEqual([])
  })

  it('the upload needs the signed headers, the declared size, and must come before the confirmation', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const target = (
      await ivan.post<{ attachmentId: string; uploadUrl: string; headers: Record<string, string> }>(
        '/attachments/upload-url',
        { ownerType: 'job', ownerId: jobId, kind: 'photo', mime: 'image/png', sizeBytes: 12 },
      )
    ).body
    // Not uploaded yet
    const early = await ivan.post('/attachments', { attachmentId: target.attachmentId })
    expect(early.status).toBe(422)
    // Other headers than the signed ones
    const wrongHeaders = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: PNG as unknown as BodyInit,
    })
    expect(wrongHeaders.status).toBe(403)
    // Other size than declared
    const wrongSize = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: target.headers,
      body: new Uint8Array(3) as unknown as BodyInit,
    })
    expect(wrongSize.status).toBe(400)
    expect(
      (
        await fetch(target.uploadUrl, {
          method: 'PUT',
          headers: target.headers,
          body: PNG as unknown as BodyInit,
        })
      ).status,
    ).toBe(200)
    expect((await ivan.post('/attachments', { attachmentId: target.attachmentId })).status).toBe(
      200,
    )
    expect(target.uploadUrl.startsWith(env.apiUrl)).toBe(true)
  })

  it('refuses a kind that does not fit the file type, and an owner that is not there', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const wrong = await ivan.post<{ errors: Record<string, string[]> }>('/attachments/upload-url', {
      ownerType: 'job',
      ownerId: jobId,
      kind: 'signature',
      mime: 'image/jpeg',
      sizeBytes: 5,
    })
    expect(wrong.status).toBe(400)
    expect(Object.keys(wrong.body.errors)).toEqual(['mime'])
    const nobody = await ivan.post('/attachments/upload-url', {
      ownerType: 'job',
      ownerId: '00000000-0000-7000-8000-000000000000',
      kind: 'photo',
      mime: 'image/png',
      sizeBytes: 5,
    })
    expect(nobody.status).toBe(400)
  })
})

describe('complete', () => {
  async function ready() {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    const list = (await ivan.get<ChecklistItem[]>(`/jobs/${jobId}/checklist`)).body
    return { ivan, jobId, list }
  }

  it('says what is missing: required checklist items, the signature, the work done', async () => {
    const { ivan, jobId, list } = await ready()
    const missing = await ivan.post<{ detail: string }>(`/jobs/${jobId}/complete`)
    expect(missing.status).toBe(422)
    expect(missing.body.detail).toContain('kontrolne liste')
    expect(missing.body.detail).toContain('potpis')
    expect(missing.body.detail).toContain('radova')

    await ivan.put(
      `/jobs/${jobId}/checklist`,
      list.map((i) => ({ id: i.id, isDone: true })),
    )
    await ivan.put(`/jobs/${jobId}/report`, { workDone: 'Gotovo.' })
    const unsigned = await ivan.post<{ detail: string }>(`/jobs/${jobId}/complete`)
    expect(unsigned.status).toBe(422)
    expect(unsigned.body.detail).toBe('Potreban je potpis klijenta.')
  })

  it('completes with the signature: status, history, report time, PDF; and only once', async () => {
    const { ivan, jobId, list } = await ready()
    await ivan.put(
      `/jobs/${jobId}/checklist`,
      list.map((i) => ({ id: i.id, isDone: true })),
    )
    await ivan.put(`/jobs/${jobId}/report`, { workDone: 'Gotovo.' })
    const signature = await attach(ivan, jobId, 'signature')
    const linked = await ivan.post<JobReport>(`/jobs/${jobId}/signature`, {
      attachmentId: signature.id,
      signedByName: 'Marko Horizont',
    })
    expect(linked.body).toMatchObject({
      signedByName: 'Marko Horizont',
      signatureAttachmentId: signature.id,
    })

    const done = await ivan.post<Job>(`/jobs/${jobId}/complete`, { sendReportToClient: false })
    expect(done.status).toBe(200)
    expect(done.body.status).toBe('completed')
    expect(done.body.report?.completedAt).not.toBeNull()
    expect(done.body.report?.pdfAttachmentId).toBeTruthy()

    const history = await ivan.get<{ toStatus: string }[]>(`/jobs/${jobId}/history`)
    expect(history.body.at(-1)?.toStatus).toBe('completed')
    expect((await ivan.post(`/jobs/${jobId}/complete`)).status).toBe(422)
    // A signature drawn is shown again from storage
    const url = await ivan.get<{ url: string }>(`/attachments/${signature.id}/url`)
    expect(url.body.url).toMatch(/^data:image\/png;base64,/)
  })

  it('a signature link needs a confirmed signature of the same job', async () => {
    const { ivan, jobId } = await ready()
    const photo = await attach(ivan, jobId, 'photo')
    const wrongKind = await ivan.post(`/jobs/${jobId}/signature`, {
      attachmentId: photo.id,
      signedByName: 'Marko',
    })
    expect(wrongKind.status).toBe(400)
  })

  it('a tenant that does not require a signature can complete without one', async () => {
    const ante = await loginAs(USERS.ante)
    const jobId = onSiteJobId('bura-klima')
    const list = (await ante.get<ChecklistItem[]>(`/jobs/${jobId}/checklist`)).body
    await ante.put(
      `/jobs/${jobId}/checklist`,
      list.map((i) => ({ id: i.id, isDone: true })),
    )
    await ante.put(`/jobs/${jobId}/report`, { workDone: 'Servis obavljen.' })
    const done = await ante.post<Job>(`/jobs/${jobId}/complete`)
    expect(done.status).toBe(200)
    expect(done.body.status).toBe('completed')
  })

  it('only a job that is on site can be completed', async () => {
    const t = tenantBySlug('alarmko')
    const scheduled = t.jobs.find((row) => row.status === 'scheduled')
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    expect((await dispatcher.post(`/jobs/${scheduled?.id ?? ''}/complete`)).status).toBe(422)
  })
})

describe('print', () => {
  it('is HTML with the job, work done and materials; people who may not see the job get 404', async () => {
    const ivan = await loginAs(USERS.ivan)
    const jobId = onSiteJobId()
    await ivan.put(`/jobs/${jobId}/report`, { workDone: 'Radovi <b>gotovi</b>' })
    const response = await ivan.get<string>(`/jobs/${jobId}/report/print`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.body).toContain('Izvještaj o radu')
    // Text is escaped
    expect(response.body).not.toContain('<b>gotovi</b>')
    expect(response.body).toContain('&#60;b&#62;gotovi')
    expect((await (await loginAs(USERS.petra)).get(`/jobs/${jobId}/report/print`)).status).toBe(404)
  })
})
