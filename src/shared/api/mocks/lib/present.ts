/**
 * Stored rows → API responses. Internal columns never leave this file, and
 * sensitive values are only included for viewers allowed to see them.
 */
import type {
  Asset,
  AssignedTechnician,
  Attachment,
  ChecklistItem,
  Client,
  ClientSummary,
  Contact,
  Invitation,
  Job,
  JobMaterial,
  JobReport,
  JobSummary,
  Location,
  Me,
  Member,
  StatusHistoryEntry,
  Technician,
  TechnicianBrief,
  TechnicianDay,
  TenantBrief,
} from '@/shared/api/generated/model'

import type {
  AssetRow,
  AttachmentRow,
  ChecklistItemRow,
  MaterialRow,
  ReportRow,
  ClientRow,
  ContactRow,
  HistoryRow,
  InvitationRow,
  JobRow,
  LocationRow,
  MembershipRow,
  MockDb,
  TechnicianRow,
  TenantData,
  UserRow,
} from '../db/rows'
import {
  canSeeClientSecrets,
  canSeeJobSecrets,
  canSeeLocationSecrets,
  isOpenStatus,
  type Viewer,
} from './access'
import type { AuthContext } from './auth'
import { visibleCustomFields } from './custom-fields'
import { allowedTransitions } from './job-machine'

export const PLAN_FEATURES: Record<string, string[]> = {
  trial: ['route_optimization', 'sms'],
  basic: ['sms'],
  pro: ['route_optimization', 'sms'],
}

function userOf(db: MockDb, userId: string): UserRow {
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw new Error(`Mock DB: user ${userId} missing`)
  return user
}

export function tenantBrief(t: TenantData): TenantBrief {
  return {
    id: t.tenant.id,
    name: t.tenant.name,
    slug: t.tenant.slug,
    logoUrl: t.tenant.logoUrl ?? null,
  }
}

export function presentMe(db: MockDb, auth: AuthContext): Me {
  const memberships = db.memberships.filter((m) => m.userId === auth.user.id && m.isActive)
  return {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      fullName: auth.user.fullName,
      phone: auth.user.phone,
    },
    tenant: tenantBrief(auth.t),
    role: auth.role,
    technicianId: auth.technicianId,
    features: PLAN_FEATURES[auth.t.tenant.plan] ?? [],
    memberships: memberships.flatMap((m) => {
      const t = db.tenants[m.tenantId]
      return t ? [{ tenant: tenantBrief(t), role: m.role }] : []
    }),
  }
}

/**
 * The mock has no SMTP, so every invitation carries its link (spec 0.2.0) for the
 * office to pass on. Points at the app's invite page (docs/backend-questions.md #21).
 */
export function presentInvitation(row: InvitationRow): Invitation {
  // No `location` outside a browser (plain Node)
  const origin = 'location' in globalThis ? globalThis.location.origin : 'http://localhost'
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    inviteUrl: `${origin}/invite?token=${encodeURIComponent(row.token)}`,
  }
}

export function presentMember(db: MockDb, t: TenantData, membership: MembershipRow): Member {
  const user = userOf(db, membership.userId)
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: membership.role,
    isActive: membership.isActive,
    technicianId: t.technicians.find((tech) => tech.userId === user.id)?.id ?? null,
    lastLoginAt: user.lastLoginAt,
  }
}

// --- technicians -------------------------------------------------------------

export function technicianBrief(db: MockDb, row: TechnicianRow): TechnicianBrief {
  return { id: row.id, fullName: userOf(db, row.userId).fullName, color: row.color }
}

export function presentTechnician(db: MockDb, t: TenantData, row: TechnicianRow): Technician {
  const user = userOf(db, row.userId)
  return {
    id: row.id,
    userId: row.userId,
    fullName: user.fullName,
    phone: user.phone,
    depotId: row.depotId ?? null,
    depot: t.depots.find((d) => d.id === row.depotId) ?? null,
    color: row.color,
    workStart: row.workStart,
    workEnd: row.workEnd,
    workingDays: row.workingDays,
    skillIds: row.skillIds,
    skills: t.skills.filter((s) => row.skillIds.includes(s.id)),
    isActive: row.isActive,
  }
}

// --- clients, locations, assets ------------------------------------------------

export function presentContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    isPrimary: row.isPrimary,
    receivesSms: row.receivesSms,
  }
}

export function presentAsset(t: TenantData, row: AssetRow, viewer: Viewer): Asset {
  const assetType = t.assetTypes.find((a) => a.id === row.assetTypeId) ?? {
    id: row.assetTypeId,
    name: '—',
    icon: null,
  }
  return {
    id: row.id,
    locationId: row.locationId,
    assetTypeId: row.assetTypeId,
    assetType,
    manufacturer: row.manufacturer ?? null,
    model: row.model ?? null,
    serialNo: row.serialNo ?? null,
    installedAt: row.installedAt ?? null,
    warrantyUntil: row.warrantyUntil ?? null,
    notes: row.notes ?? null,
    customFields: visibleCustomFields(
      t,
      'asset',
      row.customFields,
      canSeeLocationSecrets(t, viewer, row.locationId),
      row.assetTypeId,
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Single-line "street, city": Location.address, JobSummary.location.address, ClientSummary.primaryAddress. */
export const formatAddress = (location: Pick<LocationRow, 'street' | 'city'>) =>
  `${location.street}, ${location.city}`

export function presentLocation(t: TenantData, row: LocationRow, viewer: Viewer): Location {
  const canSeeSecrets = canSeeLocationSecrets(t, viewer, row.id)
  const location: Location = {
    id: row.id,
    clientId: row.clientId,
    label: row.label ?? null,
    street: row.street,
    city: row.city,
    address: formatAddress(row),
    postalCode: row.postalCode ?? null,
    country: row.country,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    geocodeStatus: row.geocodeStatus,
    accessNotes: row.accessNotes ?? null,
    hasAccessCodes: Boolean(row.accessCodes),
    assets: t.assets
      .filter((a) => a.locationId === row.id && !a.deletedAt)
      .map((a) => presentAsset(t, a, viewer)),
    customFields: visibleCustomFields(t, 'location', row.customFields, canSeeSecrets),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
  // Omitted (not null) for viewers who may not see it, as the contract says
  if (canSeeSecrets) location.accessCodes = row.accessCodes
  return location
}

export function presentClient(t: TenantData, row: ClientRow, viewer: Viewer): Client {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    oib: row.oib ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    contacts: t.contacts.filter((c) => c.clientId === row.id && !c.deletedAt).map(presentContact),
    locations: t.locations
      .filter((l) => l.clientId === row.id && !l.deletedAt)
      .map((l) => presentLocation(t, l, viewer)),
    customFields: visibleCustomFields(
      t,
      'client',
      row.customFields,
      canSeeClientSecrets(t, viewer, row.id),
    ),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function presentClientSummary(t: TenantData, row: ClientRow): ClientSummary {
  const primary =
    t.contacts.find((c) => c.clientId === row.id && !c.deletedAt && c.isPrimary) ??
    t.contacts.find((c) => c.clientId === row.id && !c.deletedAt)
  const firstLocation = t.locations.find((l) => l.clientId === row.id && !l.deletedAt)
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    primaryPhone: primary?.phone ?? null,
    primaryAddress: firstLocation ? formatAddress(firstLocation) : null,
    openJobsCount: t.jobs.filter(
      (j) => j.clientId === row.id && !j.deletedAt && isOpenStatus(j.status),
    ).length,
  }
}

// --- jobs --------------------------------------------------------------------

function assignedTechnicians(db: MockDb, t: TenantData, jobId: string): AssignedTechnician[] {
  return t.assignments
    .filter((a) => a.jobId === jobId)
    .sort((a, b) => Number(b.isLead) - Number(a.isLead))
    .flatMap((a) => {
      const technician = t.technicians.find((tech) => tech.id === a.technicianId)
      return technician ? [{ ...technicianBrief(db, technician), isLead: a.isLead }] : []
    })
}

export function presentJobSummary(db: MockDb, t: TenantData, row: JobRow): JobSummary {
  const jobType = t.jobTypes.find((jt) => jt.id === row.jobTypeId)
  const client = t.clients.find((c) => c.id === row.clientId)
  const location = t.locations.find((l) => l.id === row.locationId)
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    title: row.title,
    durationMin: row.durationMin,
    requiredPeople: row.requiredPeople,
    preferredDate: row.preferredDate ?? null,
    windowStart: row.windowStart ?? null,
    windowEnd: row.windowEnd ?? null,
    scheduledDate: row.scheduledDate ?? null,
    scheduledStart: row.scheduledStart ?? null,
    locked: row.locked,
    rescheduleRequested: row.rescheduleRequestedAt !== null,
    jobType: { id: row.jobTypeId, name: jobType?.name ?? '—', color: jobType?.color ?? '#64748b' },
    client: { id: row.clientId, name: client?.name ?? '—' },
    location: {
      id: row.locationId,
      address: location ? formatAddress(location) : '—',
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    },
    technicians: assignedTechnicians(db, t, row.id),
  }
}

export function presentChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    position: row.position,
    label: row.label,
    isRequired: row.isRequired,
    isDone: row.isDone,
    doneAt: row.doneAt ?? null,
    doneByName: row.doneByName ?? null,
  }
}

/** What an attachment looks like in a response (file bytes and bookkeeping stay out). */
export function presentAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    kind: row.kind,
    fileName: row.fileName ?? null,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    takenAt: row.takenAt ?? null,
    createdAt: row.createdAt,
  }
}

/** A confirmed file that is there to be seen (a generated one only once it is ready). */
export function isAvailable(row: AttachmentRow, now: number = Date.now()): boolean {
  return (
    !row.deletedAt &&
    row.state === 'confirmed' &&
    (row.availableAt === null || Date.parse(row.availableAt) <= now)
  )
}

/** Money as cents, for sums in the mock (the API's amounts are decimal strings). */
const cents = (amount: string) => Math.round(Number(amount) * 100)

export function presentMaterial(row: MaterialRow): JobMaterial {
  return {
    id: row.id,
    catalogItemId: row.catalogItemId ?? null,
    sku: row.sku ?? null,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
  }
}

export function presentReportOf(t: TenantData, report: ReportRow): JobReport {
  const { jobId } = report
  const materials = t.materials.filter((m) => m.jobId === jobId)
  const pdf = report.pdfAttachmentId
    ? t.attachments.find((a) => a.id === report.pdfAttachmentId)
    : undefined
  return {
    jobId,
    workDone: report.workDone ?? null,
    startedAt: report.startedAt ?? null,
    finishedAt: report.finishedAt ?? null,
    labourMinutes: report.labourMinutes ?? null,
    signedByName: report.signedByName ?? null,
    signatureAttachmentId: report.signatureAttachmentId,
    pdfAttachmentId: pdf && isAvailable(pdf) ? pdf.id : null,
    completedAt: report.completedAt ?? null,
    materials: materials.map(presentMaterial),
    checklist: t.checklistItems
      .filter((item) => item.jobId === jobId)
      .sort((a, b) => a.position - b.position)
      .map(presentChecklistItem),
    photos: t.attachments
      .filter(
        (a) => a.ownerType === 'job' && a.ownerId === jobId && a.kind === 'photo' && isAvailable(a),
      )
      .map(presentAttachment),
    totalMaterials: (materials.reduce((sum, m) => sum + cents(m.lineTotal), 0) / 100).toFixed(2),
  }
}

function presentReport(t: TenantData, jobId: string): JobReport | null {
  const report = t.reports.find((r) => r.jobId === jobId)
  return report ? presentReportOf(t, report) : null
}

export function presentJob(db: MockDb, t: TenantData, row: JobRow, viewer: Viewer): Job {
  const client = t.clients.find((c) => c.id === row.clientId)
  const location = t.locations.find((l) => l.id === row.locationId)
  const asset = row.assetId ? t.assets.find((a) => a.id === row.assetId) : undefined
  const lead = t.assignments.find((a) => a.jobId === row.id && a.isLead)
  return {
    ...presentJobSummary(db, t, row),
    source: row.source,
    description: row.description ?? null,
    internalNote: row.internalNote ?? null,
    assetId: row.assetId ?? null,
    servicePlanId: row.servicePlanId ?? null,
    onHoldReason: row.onHoldReason ?? null,
    cancelReason: row.cancelReason ?? null,
    rescheduleNote: row.rescheduleNote ?? null,
    completedAt: row.completedAt ?? null,
    ...(client ? { clientDetail: presentClient(t, client, viewer) } : {}),
    ...(location ? { locationDetail: presentLocation(t, location, viewer) } : {}),
    asset: asset ? presentAsset(t, asset, viewer) : null,
    routeStop: lead?.sequence ? { sequence: lead.sequence, eta: null } : null,
    report: presentReport(t, row.id),
    customFields: visibleCustomFields(t, 'job', row.customFields, canSeeJobSecrets(t, viewer, row)),
    allowedTransitions: allowedTransitions(t, viewer, row),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function presentHistory(row: HistoryRow): StatusHistoryEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus,
    changedBy: row.changedBy ?? null,
    actor: row.actor,
    changedAt: row.changedAt,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    note: row.note ?? null,
  }
}

/** A technician's jobs for a day in visit order (cancelled jobs left out). Route plans come later. */
export function presentTechnicianDay(
  db: MockDb,
  t: TenantData,
  technician: TechnicianRow,
  date: string,
  viewer: Viewer,
): TechnicianDay {
  const sequenceOf = (job: JobRow) =>
    t.assignments.find((a) => a.jobId === job.id && a.isLead)?.sequence ?? Number.MAX_SAFE_INTEGER
  const jobs = t.jobs
    .filter(
      (job) =>
        !job.deletedAt &&
        job.scheduledDate === date &&
        job.status !== 'cancelled' &&
        t.assignments.some((a) => a.jobId === job.id && a.technicianId === technician.id),
    )
    .sort(
      (a, b) =>
        (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? '') ||
        sequenceOf(a) - sequenceOf(b) ||
        a.number.localeCompare(b.number),
    )
  return {
    date,
    technician: technicianBrief(db, technician),
    route: null,
    jobs: jobs.map((job) => presentJob(db, t, job, viewer)),
  }
}
