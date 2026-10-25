import type {
  JobMaterialInput,
  ChecklistItem,
  CompleteJobBody,
  JobMaterial,
  JobReport,
  JobReportInput,
  ListCatalogItemsParams,
  UpdateJobChecklistBodyItem,
} from '@/shared/api/generated/model'
import { timeInTimeZone, toIsoInstant } from '@/shared/lib/datetime'

import type { AttachmentRow, JobRow, MaterialRow, TenantData } from '../db/rows'
import { ALL_ROLES, getVisibleJob, viewerOf } from '../lib/access'
import { newId } from '../lib/ids'
import { recordTransition, touch } from '../lib/job-changes'
import {
  created,
  FieldErrors,
  html,
  MESSAGES,
  noContent,
  notFound,
  ok,
  unprocessable,
} from '../lib/problems'
import { presentChecklistItem, presentJob, presentMaterial, presentReportOf } from '../lib/present'
import { assertReportEditable, completionProblems, ensureReport } from '../lib/report-access'
import { route } from '../lib/route'
import { matchesQuery } from '../lib/text'

/** The mock builds the PDF "in the background": it is ready this long after completion. */
const PDF_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 3000

const MONEY = /^-?\d{1,10}(\.\d{1,2})?$/

const money = (cents: number) => (cents / 100).toFixed(2)

function checklistOf(t: TenantData, jobId: string): ChecklistItem[] {
  return t.checklistItems
    .filter((item) => item.jobId === jobId)
    .sort((a, b) => a.position - b.position)
    .map(presentChecklistItem)
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`)

/** A plain printable report; the real one is the tenant's template. */
function printable(t: TenantData, job: JobRow, report: JobReport): string {
  const tz = t.tenant.timezone
  const client = t.clients.find((c) => c.id === job.clientId)
  const when = (instant: string | null | undefined) =>
    instant ? `${instant.slice(0, 10)} ${timeInTimeZone(instant, tz)}` : '—'
  const rows = report.materials
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.quantity)} ${escapeHtml(m.unit)}</td><td>${m.lineTotal}</td></tr>`,
    )
    .join('')
  const checks = report.checklist
    .map((item) => `<li>${item.isDone ? '☑' : '☐'} ${escapeHtml(item.label)}</li>`)
    .join('')
  return `<!doctype html><html lang="hr"><head><meta charset="utf-8"><title>${escapeHtml(job.number)}</title></head><body>
<h1>${escapeHtml(t.tenant.name)}</h1>
<h2>Izvještaj o radu ${escapeHtml(job.number)}</h2>
<p>${escapeHtml(job.title)} — ${escapeHtml(client?.name ?? '')}</p>
<p>Početak: ${when(report.startedAt)} · Kraj: ${when(report.finishedAt)} · Rad: ${String(report.labourMinutes ?? 0)} min</p>
<h3>Izvršeni radovi</h3><p>${escapeHtml(report.workDone ?? '')}</p>
<h3>Kontrolna lista</h3><ul>${checks}</ul>
<h3>Materijal</h3><table>${rows}</table><p>Ukupno: ${report.totalMaterials ?? '0.00'}</p>
<p>Potpisao: ${escapeHtml(report.signedByName ?? '—')}</p>
</body></html>`
}

function addMaterial(
  t: TenantData,
  job: JobRow,
  body: JobMaterialInput,
  errors: FieldErrors,
): MaterialRow | null {
  let name: string | undefined
  let unit: string | undefined
  let unitPrice = '0.00'
  let sku: string | null = null
  let catalogItemId: string | null = null
  if (body.catalogItemId) {
    const item = t.catalogItems.find((c) => c.id === body.catalogItemId && c.isActive)
    if (!item) errors.add('catalogItemId', MESSAGES.notFound)
    else {
      name = item.name
      unit = item.unit
      unitPrice = item.price
      sku = item.sku
      catalogItemId = item.id
    }
  } else {
    if (!body.name?.trim()) errors.add('name', MESSAGES.required)
    if (!body.unit?.trim()) errors.add('unit', MESSAGES.required)
    name = body.name?.trim()
    unit = body.unit?.trim()
    if (body.unitPrice !== undefined) {
      if (!MONEY.test(body.unitPrice)) errors.add('unitPrice', MESSAGES.invalidFormat)
      else unitPrice = body.unitPrice
    }
  }
  const quantity = Number(body.quantity)
  if (!(quantity > 0)) errors.add('quantity', MESSAGES.minimum(0.001))
  errors.throwIfAny()
  if (!name || !unit) return null
  return {
    id: newId(),
    jobId: job.id,
    catalogItemId,
    sku,
    name,
    quantity: body.quantity,
    unit,
    unitPrice,
    lineTotal: money(Math.round(Number(unitPrice) * 100 * quantity)),
  }
}

export const reportHandlers = [
  route(
    'get',
    '/jobs/{id}/report',
    ({ auth, params }) => {
      const t = auth.t
      const job = getVisibleJob(t, viewerOf(auth), params.id)
      return ok(presentReportOf(t, ensureReport(t, job.id)))
    },
    { roles: ALL_ROLES },
  ),

  route<JobReportInput>(
    'put',
    '/jobs/{id}/report',
    ({ auth, params, body }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      assertReportEditable(viewer, job)
      const report = ensureReport(t, job.id)
      const next = { ...report, ...body }
      if (
        next.startedAt &&
        next.finishedAt &&
        Date.parse(next.finishedAt) < Date.parse(next.startedAt)
      ) {
        const errors = new FieldErrors()
        errors.add('finishedAt', 'Kraj ne može biti prije početka.')
        errors.throwIfAny()
      }
      Object.assign(report, body)
      return ok(presentReportOf(t, report))
    },
    { roles: ALL_ROLES },
  ),

  route(
    'get',
    '/jobs/{id}/checklist',
    ({ auth, params }) => {
      const job = getVisibleJob(auth.t, viewerOf(auth), params.id)
      return ok(checklistOf(auth.t, job.id))
    },
    { roles: ALL_ROLES },
  ),

  route<UpdateJobChecklistBodyItem[]>(
    'put',
    '/jobs/{id}/checklist',
    ({ auth, params, body }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      assertReportEditable(viewer, job)
      const errors = new FieldErrors()
      const items = body.map((change, index) => {
        const item = t.checklistItems.find((i) => i.jobId === job.id && i.id === change.id)
        if (!item) errors.add(`[${String(index)}].id`, MESSAGES.notFound)
        return { item, change }
      })
      errors.throwIfAny()
      const now = toIsoInstant(Date.now())
      for (const { item, change } of items) {
        if (!item || item.isDone === change.isDone) continue
        item.isDone = change.isDone
        item.doneAt = change.isDone ? now : null
        item.doneByName = change.isDone ? auth.user.fullName : null
      }
      return ok(checklistOf(t, job.id))
    },
    { roles: ALL_ROLES },
  ),

  route(
    'get',
    '/jobs/{id}/materials',
    ({ auth, params }) => {
      const job = getVisibleJob(auth.t, viewerOf(auth), params.id)
      return ok(auth.t.materials.filter((m) => m.jobId === job.id).map(presentMaterial))
    },
    { roles: ALL_ROLES },
  ),

  route<JobMaterialInput>(
    'post',
    '/jobs/{id}/materials',
    ({ auth, params, body }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      assertReportEditable(viewer, job)
      const material = addMaterial(t, job, body, new FieldErrors())
      if (!material) throw notFound()
      t.materials.push(material)
      return created(presentMaterial(material) satisfies JobMaterial)
    },
    { roles: ALL_ROLES },
  ),

  route(
    'delete',
    '/jobs/{id}/materials/{materialId}',
    ({ auth, params, url }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      assertReportEditable(viewer, job)
      const materialId = url.pathname.split('/').pop() ?? ''
      const index = t.materials.findIndex((m) => m.jobId === job.id && m.id === materialId)
      if (index === -1) throw notFound()
      t.materials.splice(index, 1)
      return noContent()
    },
    { roles: ALL_ROLES },
  ),

  route<undefined, ListCatalogItemsParams>(
    'get',
    '/catalog-items',
    ({ auth, query }) => {
      const rows = auth.t.catalogItems
        .filter((item) => query.includeInactive === true || item.isActive)
        .filter((item) => matchesQuery(query.q, [item.name, item.sku]))
        .sort((a, b) => a.name.localeCompare(b.name))
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 50
      return ok({
        page,
        pageSize,
        totalCount: rows.length,
        items: rows.slice((page - 1) * pageSize, page * pageSize),
      })
    },
    { roles: ALL_ROLES },
  ),

  route<{ attachmentId: string; signedByName: string }>(
    'post',
    '/jobs/{id}/signature',
    ({ auth, params, body }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      assertReportEditable(viewer, job)
      const attachment = t.attachments.find(
        (a) =>
          a.id === body.attachmentId &&
          !a.deletedAt &&
          a.state === 'confirmed' &&
          a.kind === 'signature' &&
          a.ownerType === 'job' &&
          a.ownerId === job.id,
      )
      if (!attachment) {
        const errors = new FieldErrors()
        errors.add('attachmentId', MESSAGES.notFound)
        errors.throwIfAny()
        throw notFound()
      }
      const report = ensureReport(t, job.id)
      report.signatureAttachmentId = attachment.id
      report.signedByName = body.signedByName.trim()
      return ok(presentReportOf(t, report))
    },
    { roles: ALL_ROLES },
  ),

  route<CompleteJobBody | undefined>(
    'post',
    '/jobs/{id}/complete',
    ({ db, auth, params, body }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      if (job.status !== 'on_site') {
        throw unprocessable('job.not_on_site', 'Nalog se može završiti samo na lokaciji.')
      }
      const report = ensureReport(t, job.id)
      const problems = completionProblems(t, job, report)
      if (problems.length > 0) {
        throw unprocessable('job.completion_requirements', problems.join(' '))
      }
      const now = toIsoInstant(Date.now())
      report.completedAt = now
      report.startedAt ??=
        t.history.find((h) => h.jobId === job.id && h.toStatus === 'on_site')?.changedAt ?? null
      report.finishedAt ??= now
      job.status = 'completed'
      job.completedAt = now
      recordTransition(t, job, auth, 'on_site', 'completed', { lat: body?.lat, lng: body?.lng })
      touch(job)
      const pdf: AttachmentRow = {
        id: newId(),
        ownerType: 'job',
        ownerId: job.id,
        kind: 'pdf',
        fileName: `${job.number}.pdf`,
        mime: 'application/pdf',
        sizeBytes: 48_000,
        takenAt: null,
        createdAt: now,
        deletedAt: null,
        state: 'confirmed',
        availableAt: toIsoInstant(Date.now() + PDF_DELAY_MS),
        preview: null,
      }
      t.attachments.push(pdf)
      report.pdfAttachmentId = pdf.id
      if (body?.sendReportToClient !== false) {
        const usage = t.usage.find((u) => u.month === now.slice(0, 7))
        if (usage) usage.emailCount += 1
      }
      return ok(presentJob(db, t, job, viewer))
    },
    { roles: ALL_ROLES },
  ),

  route(
    'get',
    '/jobs/{id}/report/print',
    ({ auth, params }) => {
      const t = auth.t
      const job = getVisibleJob(t, viewerOf(auth), params.id)
      const report = presentReportOf(t, ensureReport(t, job.id))
      return html(printable(t, job, report))
    },
    { roles: ALL_ROLES },
  ),
]
