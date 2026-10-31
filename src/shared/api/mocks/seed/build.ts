import type {
  AssetType,
  CatalogItem,
  ChecklistTemplate,
  CustomFieldDefinition,
  Depot,
  JobStatus,
  JobType,
  Skill,
  Tenant,
} from '@/shared/api/generated/model'
import {
  addDays,
  dateInTimeZone,
  toIsoInstant,
  zonedDateTimeToInstant,
} from '@/shared/lib/datetime'
import { countryFromLocale } from '@/shared/lib/phone'

import type {
  AssetRow,
  AttachmentRow,
  AssignmentRow,
  ChecklistItemRow,
  ClientRow,
  ContactRow,
  HistoryRow,
  InvitationRow,
  JobRow,
  LocationRow,
  MaterialRow,
  MembershipRow,
  ReportRow,
  TechnicianRow,
  TenantData,
  UserRow,
} from '../db/rows'
import { seedMessages } from './messages'
import type { JobSeed, TenantSeed } from './types'

export interface SeedContext {
  today: string
  id: () => string
  usersByKey: Map<string, UserRow>
}

/** How a seeded job reached its status; every step is allowed by the OpenAPI status table. */
const STATUS_PATHS: Record<JobStatus, JobStatus[]> = {
  new: ['new'],
  scheduled: ['new', 'scheduled'],
  confirmed: ['new', 'scheduled', 'confirmed'],
  en_route: ['new', 'scheduled', 'confirmed', 'en_route'],
  on_site: ['new', 'scheduled', 'confirmed', 'en_route', 'on_site'],
  on_hold: ['new', 'scheduled', 'en_route', 'on_site', 'on_hold'],
  completed: ['new', 'scheduled', 'confirmed', 'en_route', 'on_site', 'completed'],
  invoiced: ['new', 'scheduled', 'confirmed', 'en_route', 'on_site', 'completed', 'invoiced'],
  cancelled: ['new', 'scheduled', 'cancelled'],
}

/** Steps performed in the field by the lead technician. */
const FIELD_STEPS = new Set<JobStatus>(['en_route', 'on_site', 'on_hold', 'completed'])

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed error: unknown ${what}`)
  return value
}

/** A scribble standing in for a signature drawn on a phone. */
const SIGNATURE_PREVIEW = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="112" viewBox="0 0 256 112"><rect width="100%" height="100%" fill="white"/><path d="M20 70 C40 20 60 100 90 50 S140 20 160 70 S210 90 236 40" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round"/></svg>',
)}`

export function buildTenant(
  seed: TenantSeed,
  ctx: SeedContext,
): { tenantId: string; data: TenantData; memberships: MembershipRow[] } {
  const { today, id } = ctx
  const tz = seed.timezone
  const at = (dayOffset: number, time: string) =>
    zonedDateTimeToInstant(addDays(today, dayOffset), time, tz)
  const plusMinutes = (iso: string, minutes: number) =>
    toIsoInstant(Date.parse(iso) + minutes * 60_000)
  const user = (key: string) => required(ctx.usersByKey.get(key), `user "${key}"`)
  const country = countryFromLocale(seed.locale) ?? 'HR'

  // --- tenant & organisation -------------------------------------------------
  const tenantId = id()
  const tenantCreatedAt = at(-400, '09:00')
  const tenant: Tenant = {
    id: tenantId,
    slug: seed.slug,
    name: seed.name,
    oib: seed.oib,
    address: seed.address,
    phone: seed.phone,
    email: seed.email,
    iban: seed.iban,
    logoAttachmentId: null,
    logoUrl: null,
    locale: seed.locale,
    timezone: seed.timezone,
    currency: seed.currency,
    settings: seed.settings,
    plan: seed.plan,
    status: 'active',
    createdAt: tenantCreatedAt,
    updatedAt: tenantCreatedAt,
  }

  const memberships: MembershipRow[] = seed.members.map((m) => ({
    tenantId,
    userId: user(m.user).id,
    role: m.role,
    isActive: true,
    canAccessSales: m.canAccessSales ?? false,
  }))
  const officeUser = user(
    required(
      seed.members.find((m) => m.role === 'dispatcher') ??
        seed.members.find((m) => m.role === 'owner'),
      'office member',
    ).user,
  )

  const depot: Depot = { id: id(), ...seed.depot }
  const skills: Skill[] = seed.skills.map((name) => ({ id: id(), name }))
  const skillId = (name: string) =>
    required(
      skills.find((s) => s.name === name),
      `skill "${name}"`,
    ).id

  const technicians: TechnicianRow[] = seed.technicians.map((t) => ({
    id: id(),
    userId: user(t.user).id,
    depotId: depot.id,
    color: t.color,
    workStart: '07:00',
    workEnd: '15:00',
    workingDays: [1, 2, 3, 4, 5],
    skillIds: t.skills.map(skillId),
    isActive: true,
  }))
  const technicianByUserKey = (key: string) =>
    required(
      technicians.find((t) => t.userId === user(key).id),
      `technician "${key}"`,
    )

  // --- configuration ---------------------------------------------------------
  const checklistTemplates: ChecklistTemplate[] = seed.checklists.map((c) => ({
    id: id(),
    name: c.name,
    items: c.items.map((item) => ({ label: item.label, required: item.required ?? false })),
  }))
  const jobTypes: JobType[] = seed.jobTypes.map((jt) => ({
    id: id(),
    name: jt.name,
    color: jt.color,
    defaultDurationMin: jt.minutes,
    requiredPeople: jt.people,
    requiredSkillIds: (jt.skills ?? []).map(skillId),
    checklistTemplateId: jt.checklist
      ? required(
          checklistTemplates.find((c) => c.name === jt.checklist),
          `checklist "${jt.checklist}"`,
        ).id
      : null,
    smsEnabled: true,
    isActive: true,
  }))
  const assetTypes: AssetType[] = seed.assetTypes.map((a) => ({
    id: id(),
    name: a.name,
    icon: a.icon,
  }))
  const assetTypeId = (name: string) =>
    required(
      assetTypes.find((a) => a.name === name),
      `asset type "${name}"`,
    ).id
  const customFields: CustomFieldDefinition[] = seed.customFields.map((f, index) => ({
    id: id(),
    entity: f.entity,
    assetTypeId: f.assetType ? assetTypeId(f.assetType) : null,
    key: f.key,
    label: f.label,
    type: f.type,
    options: f.options ?? null,
    required: f.required ?? false,
    isSensitive: f.isSensitive ?? false,
    sortOrder: index + 1,
  }))

  // --- clients, locations, assets -----------------------------------------------
  const clients: ClientRow[] = []
  const contacts: ContactRow[] = []
  const locations: LocationRow[] = []
  const assets: AssetRow[] = []
  const locationsByClientKey = new Map<string, LocationRow[]>()
  const assetsByKey = new Map<string, AssetRow>()

  for (const c of seed.clients) {
    const createdAt = at(-c.createdDaysAgo, '10:00')
    const clientId = id()
    clients.push({
      id: clientId,
      type: c.type,
      name: c.name,
      oib: c.oib ?? null,
      email: c.email ?? null,
      notes: c.notes ?? null,
      customFields: c.customFields ?? {},
      version: 1,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    })
    c.contacts.forEach((contact, index) => {
      contacts.push({
        id: id(),
        clientId,
        name: contact.name,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        isPrimary: index === 0,
        receivesSms: contact.receivesSms ?? true,
        deletedAt: null,
      })
    })
    const clientLocations = c.locations.map((l): LocationRow => {
      const locationId = id()
      for (const a of l.assets ?? []) {
        const installedAt =
          a.installedYearsAgo === undefined ? null : addDays(today, -365 * a.installedYearsAgo)
        const asset: AssetRow = {
          id: id(),
          locationId,
          assetTypeId: assetTypeId(a.type),
          manufacturer: a.manufacturer,
          model: a.model,
          serialNo: a.serialNo,
          installedAt,
          warrantyUntil:
            installedAt && a.warrantyYears !== undefined
              ? addDays(installedAt, 365 * a.warrantyYears)
              : null,
          notes: a.notes ?? null,
          customFields: a.customFields ?? {},
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }
        assets.push(asset)
        if (a.key) assetsByKey.set(a.key, asset)
      }
      return {
        id: locationId,
        clientId,
        label: l.label ?? null,
        street: l.street,
        city: l.city,
        postalCode: l.postalCode,
        country,
        lat: l.lat,
        lng: l.lng,
        geocodeStatus: 'ok',
        accessNotes: l.accessNotes ?? null,
        accessCodes: l.accessCodes ?? null,
        customFields: l.customFields ?? {},
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }
    })
    locations.push(...clientLocations)
    locationsByClientKey.set(c.key, clientLocations)
  }

  // --- jobs ------------------------------------------------------------------
  const jobs: JobRow[] = []
  const assignments: AssignmentRow[] = []
  const history: HistoryRow[] = []
  const checklistItems: ChecklistItemRow[] = []
  const reports: ReportRow[] = []
  const attachments: AttachmentRow[] = []
  const materials: MaterialRow[] = []
  const catalogItems: CatalogItem[] = seed.catalog.map((item) => ({
    id: id(),
    ...item,
    isActive: true,
  }))

  for (const j of seed.jobs) {
    buildJob(j)
  }

  function buildJob(j: JobSeed) {
    const clientIndex = seed.clients.findIndex((c) => c.key === j.client)
    const clientSeed = required(seed.clients[clientIndex], `client "${j.client}"`)
    const client = required(clients[clientIndex], `client row "${j.client}"`)
    const location = required(
      locationsByClientKey.get(j.client)?.[j.location ?? 0],
      `location ${String(j.location ?? 0)} of "${j.client}"`,
    )
    const jobType = required(
      jobTypes.find((t) => t.name === j.type),
      `job type "${j.type}"`,
    )
    const asset = j.asset ? required(assetsByKey.get(j.asset), `asset "${j.asset}"`) : null
    const techs = (j.techs ?? []).map(technicianByUserKey)
    const leadUser = j.techs?.[0] ? user(j.techs[0]) : null

    const scheduledDate = j.day === undefined ? null : addDays(today, j.day)
    const scheduledStart = j.day !== undefined && j.time ? at(j.day, j.time) : null
    const createdDaysAgo = j.createdDaysAgo ?? (j.day === undefined ? 1 : Math.max(2, 4 - j.day))
    const createdAt = at(-createdDaysAgo, '09:15')
    const durationMin = jobType.defaultDurationMin
    const jobId = id()

    const path = STATUS_PATHS[j.status]
    if (path.length > 2 && j.status !== 'cancelled' && (!scheduledStart || techs.length === 0)) {
      throw new Error(`Seed error: job "${j.title}" (${j.status}) needs day, time and technicians`)
    }
    const start = scheduledStart ?? createdAt
    const timeOf: Record<JobStatus, string> = {
      new: createdAt,
      scheduled: plusMinutes(createdAt, 30),
      confirmed: plusMinutes(start, -12 * 60),
      en_route: plusMinutes(start, -30),
      on_site: start,
      on_hold: plusMinutes(start, 60),
      completed: plusMinutes(start, durationMin),
      invoiced: plusMinutes(start, durationMin + 24 * 60),
      cancelled: plusMinutes(createdAt, 120),
    }

    path.forEach((status, index) => {
      const byClient = status === 'confirmed'
      const actor = byClient ? null : FIELD_STEPS.has(status) && leadUser ? leadUser : officeUser
      history.push({
        id: id(),
        jobId,
        fromStatus: index === 0 ? null : (path[index - 1] ?? null),
        toStatus: status,
        changedBy: actor ? { id: actor.id, fullName: actor.fullName } : null,
        actor: byClient ? 'client' : 'user',
        changedAt: timeOf[status],
        lat: status === 'on_site' ? location.lat : null,
        lng: status === 'on_site' ? location.lng : null,
        note: status === 'on_hold' || status === 'cancelled' ? (j.reason ?? null) : null,
      })
    })

    const isDone = j.status === 'completed' || j.status === 'invoiced'
    const completedAt = isDone ? timeOf.completed : null
    const lastChange = timeOf[path[path.length - 1] ?? 'new']

    jobs.push({
      id: jobId,
      number: '', // allocated below in creation order
      status: j.status,
      priority: j.priority ?? 'normal',
      title: j.title,
      durationMin,
      requiredPeople: jobType.requiredPeople,
      preferredDate: j.preferredInDays === undefined ? null : addDays(today, j.preferredInDays),
      windowStart: j.window?.[0] ?? null,
      windowEnd: j.window?.[1] ?? null,
      scheduledDate,
      scheduledStart,
      locked: j.locked ?? false,
      source: j.source ?? 'phone',
      description: j.description ?? null,
      internalNote: j.internalNote ?? null,
      assetId: asset?.id ?? null,
      servicePlanId: null,
      onHoldReason: j.status === 'on_hold' ? (j.reason ?? null) : null,
      cancelReason: j.status === 'cancelled' ? (j.reason ?? null) : null,
      rescheduleNote: j.rescheduleNote ?? null,
      completedAt,
      customFields: j.customFields ?? {},
      version: path.length,
      createdAt,
      updatedAt: lastChange,
      deletedAt: null,
      clientId: client.id,
      locationId: location.id,
      jobTypeId: jobType.id,
      rescheduleRequestedAt: j.rescheduleNote ? at(0, '07:30') : null,
      publicToken: null,
      publicTokenExpiresAt: null,
      createdBy: officeUser.id,
    })

    techs.forEach((tech, index) => {
      assignments.push({
        jobId,
        technicianId: tech.id,
        isLead: index === 0,
        sequence: null,
        assignedAt: timeOf.scheduled,
      })
    })

    const template = checklistTemplates.find((c) => c.id === jobType.checklistTemplateId)
    template?.items.forEach((item, index) => {
      const done = isDone || (j.status === 'on_site' && index === 0)
      checklistItems.push({
        id: id(),
        jobId,
        position: index + 1,
        label: item.label,
        isRequired: item.required ?? false,
        isDone: done,
        doneAt: done ? plusMinutes(isDone ? timeOf.completed : start, -15) : null,
        doneByName: done ? (leadUser?.fullName ?? null) : null,
      })
    })

    if (isDone) {
      const signatureId = id()
      const pdfId = id()
      reports.push({
        jobId,
        workDone: j.workDone ?? `${jobType.name}: radovi izvršeni prema nalogu.`,
        startedAt: timeOf.on_site,
        finishedAt: timeOf.completed,
        labourMinutes: durationMin * Math.max(1, techs.length),
        signedByName: clientSeed.contacts[0]?.name ?? null,
        completedAt,
        signatureAttachmentId: signatureId,
        pdfAttachmentId: pdfId,
      })
      attachments.push({
        id: signatureId,
        ownerType: 'job',
        ownerId: jobId,
        kind: 'signature',
        fileName: 'signature.png',
        mime: 'image/png',
        sizeBytes: SIGNATURE_PREVIEW.length,
        takenAt: null,
        createdAt: completedAt ?? timeOf.completed,
        deletedAt: null,
        state: 'confirmed',
        availableAt: null,
        preview: SIGNATURE_PREVIEW,
      })
      attachments.push({
        id: pdfId,
        ownerType: 'job',
        ownerId: jobId,
        kind: 'pdf',
        fileName: `${jobId}.pdf`,
        mime: 'application/pdf',
        sizeBytes: 48_000,
        takenAt: null,
        createdAt: completedAt ?? timeOf.completed,
        deletedAt: null,
        state: 'confirmed',
        availableAt: null,
        preview: null,
      })
      for (const used of j.materials ?? []) {
        const item = required(
          catalogItems.find((candidate) => candidate.sku === used.sku),
          `catalog item "${used.sku}"`,
        )
        const quantity = Number(used.quantity)
        materials.push({
          id: id(),
          jobId,
          catalogItemId: item.id,
          sku: item.sku,
          name: item.name,
          quantity: used.quantity,
          unit: item.unit,
          unitPrice: item.price,
          lineTotal: (Math.round(Number(item.price) * 100 * quantity) / 100).toFixed(2),
        })
      }
    }
  }

  // Job numbers in creation order, per year: RN-2026-0001
  const prefix = seed.settings.jobNumberPrefix ?? 'RN'
  const jobSequence: Record<string, number> = {}
  for (const job of [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const year = dateInTimeZone(job.createdAt, tz).slice(0, 4)
    const next = (jobSequence[year] ?? 0) + 1
    jobSequence[year] = next
    job.number = `${prefix}-${year}-${String(next).padStart(4, '0')}`
  }

  // Visit order of each lead technician's day
  const leadDays = new Map<string, AssignmentRow[]>()
  for (const assignment of assignments.filter((a) => a.isLead)) {
    const job = jobs.find((j) => j.id === assignment.jobId)
    if (!job?.scheduledDate) continue
    const key = `${assignment.technicianId}|${job.scheduledDate}`
    leadDays.set(key, [...(leadDays.get(key) ?? []), assignment])
  }
  for (const day of leadDays.values()) {
    const startOf = (a: AssignmentRow) => jobs.find((j) => j.id === a.jobId)?.scheduledStart ?? ''
    day.sort((a, b) => startOf(a).localeCompare(startOf(b)))
    day.forEach((assignment, index) => {
      assignment.sequence = index + 1
    })
  }

  const invitations: InvitationRow[] = (seed.invitations ?? []).map((inv) => ({
    id: id(),
    email: inv.email,
    role: inv.role,
    canAccessSales: false,
    createdAt: at(-inv.daysAgo, '09:00'),
    expiresAt: at(7 - inv.daysAgo, '09:00'),
    token: `inv_${id().replace(/-/g, '')}`,
    revokedAt: null,
  }))

  return {
    tenantId,
    memberships,
    data: {
      tenant,
      depots: [depot],
      skills,
      technicians,
      invitations,
      jobTypes,
      checklistTemplates,
      messages: seedMessages({
        jobs,
        contacts,
        company: seed.name,
        timeZone: tz,
        id,
      }),
      messageTemplates: seed.messageTemplates.map((template) => ({
        id: id(),
        locale: seed.locale,
        subject: null,
        isActive: true,
        ...template,
        isDefault: false,
      })),
      assetTypes,
      customFields,
      clients,
      contacts,
      locations,
      assets,
      jobs,
      assignments,
      history,
      checklistItems,
      reports,
      materials,
      catalogItems,
      attachments,
      jobSequence,
      usage: [{ month: today.slice(0, 7), ...seed.usage }],
      routePlans: [],
    },
  }
}
