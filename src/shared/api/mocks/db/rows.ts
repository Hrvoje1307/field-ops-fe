/**
 * Stored rows of the mock database. Every API-visible field comes from the
 * generated model types; rows only add database columns the API never returns
 * (tenant/foreign keys, soft-delete markers, secrets, auth state).
 */
import type {
  AssetType,
  Asset,
  Attachment,
  CatalogItem,
  ChecklistItem,
  ChecklistTemplate,
  Client,
  Contact,
  CustomFieldDefinition,
  Depot,
  Invitation,
  Job,
  JobMaterial,
  JobReport,
  JobType,
  Location,
  Message,
  MessageTemplate,
  Role,
  RoutePlan,
  Skill,
  StatusHistoryEntry,
  TechnicianCreate,
  Tenant,
  Usage,
} from '@/shared/api/generated/model'

/**
 * Bump when the stored shape changes: older data in localStorage is then reseeded
 * instead of being read with missing fields. (2: invitation tokens, spec 0.2.0;
 * 3: custom fields of every type in both tenants; 4: route plans; 5: reports, materials, catalog and attachments; 6: message templates; 7: messages and public links; 8: sales access on memberships and invitations, spec 0.3.1)
 */
export const MOCK_DB_SCHEMA_VERSION = 8

/** Response types mark timestamps readonly; stored rows are written by the mock. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

interface SoftDeletable {
  deletedAt: string | null
}

export interface UserRow {
  id: string
  email: string
  fullName: string
  phone: string | null
  /** Plain text: this is a mock. */
  password: string
  lastTenantId: string | null
  lastLoginAt: string | null
}

export interface MembershipRow {
  tenantId: string
  userId: string
  role: Role
  isActive: boolean
  /** Sales permission; owners always have it (Member.canAccessSales), see `hasSalesAccess`. */
  canAccessSales: boolean
}

export interface RefreshTokenRow {
  token: string
  familyId: string
  userId: string
  tenantId: string
  expiresAt: string
  /** Set when rotated; presenting it again is reuse → the family is revoked. */
  usedAt: string | null
  revokedAt: string | null
}

export interface LoginThrottleRow {
  email: string
  /** Failed attempts inside the current 15-minute window. */
  failures: string[]
  lockedUntil: string | null
}

export interface IdempotencyRow {
  tenantId: string
  userId: string
  key: string
  /** method + path + body, compared on replay */
  requestSignature: string
  status: number
  body: unknown
  headers: Record<string, string>
  createdAt: string
}

export type TechnicianRow = TechnicianCreate & { id: string }

/** `inviteUrl` is derived from the token when presenting. */
export type InvitationRow = Omit<Invitation, 'inviteUrl'> & {
  /** Secret part of the invite link. */
  token: string
  revokedAt: string | null
}

export type ClientRow = Mutable<Omit<Client, 'contacts' | 'locations'>> & SoftDeletable

export type ContactRow = Contact & SoftDeletable & { clientId: string }

export type LocationRow = Mutable<
  Omit<Location, 'assets' | 'accessCodes' | 'hasAccessCodes' | 'address'>
> &
  SoftDeletable & {
    /** Secret; only returned to allowed viewers. */
    accessCodes: string | null
  }

export type AssetRow = Mutable<Omit<Asset, 'assetType'>> & SoftDeletable

export type JobRow = Mutable<
  Pick<
    Job,
    | 'id'
    | 'number'
    | 'status'
    | 'priority'
    | 'title'
    | 'durationMin'
    | 'requiredPeople'
    | 'preferredDate'
    | 'windowStart'
    | 'windowEnd'
    | 'scheduledDate'
    | 'scheduledStart'
    | 'locked'
    | 'source'
    | 'description'
    | 'internalNote'
    | 'assetId'
    | 'servicePlanId'
    | 'onHoldReason'
    | 'cancelReason'
    | 'rescheduleNote'
    | 'completedAt'
    | 'customFields'
    | 'version'
    | 'createdAt'
    | 'updatedAt'
  >
> &
  SoftDeletable & {
    clientId: string
    locationId: string
    jobTypeId: string
    rescheduleRequestedAt: string | null
    /** The secret of the client's link (`/p/<token>`), made when the first message goes out. */
    publicToken: string | null
    publicTokenExpiresAt: string | null
    createdBy: string | null
  }

export interface AssignmentRow {
  jobId: string
  technicianId: string
  isLead: boolean
  /** Position in the lead technician's day. */
  sequence: number | null
  assignedAt: string
}

/**
 * A message as stored: what it will be once it has been sent and delivered. `status`,
 * `sentAt` and `deliveredAt` are worked out from the time when it is presented.
 */
export type MessageRow = Omit<Message, 'status' | 'sentAt' | 'deliveredAt'> & {
  /** How it ends: delivered, or one of the two ways it fails. */
  outcome: 'delivered' | 'failed' | 'undeliverable'
  sentAt: string
  deliveredAt: string | null
}

export type HistoryRow = StatusHistoryEntry & { jobId: string }

export type ChecklistItemRow = ChecklistItem & { jobId: string }

export type ReportRow = Pick<
  JobReport,
  | 'jobId'
  | 'workDone'
  | 'startedAt'
  | 'finishedAt'
  | 'labourMinutes'
  | 'signedByName'
  | 'completedAt'
> & {
  signatureAttachmentId: string | null
  /** The PDF of a completed job; it appears on the report once it is ready. */
  pdfAttachmentId: string | null
}

export type MaterialRow = JobMaterial & { jobId: string }

export type AttachmentRow = Attachment & {
  deletedAt: string | null
  /** Created by `upload-url`; usable only after the file was uploaded and confirmed. */
  state: 'pending' | 'uploaded' | 'confirmed'
  /** A generated file (the report PDF) shows up at this instant. */
  availableAt: string | null
  /** The bytes of a small file as a data URL (signatures); larger files keep none. */
  preview: string | null
}

export interface TenantData {
  tenant: Mutable<Tenant>
  depots: Depot[]
  skills: Skill[]
  technicians: TechnicianRow[]
  invitations: InvitationRow[]
  jobTypes: JobType[]
  checklistTemplates: ChecklistTemplate[]
  /** The tenant's own message templates; the platform defaults are not stored. */
  messageTemplates: MessageTemplate[]
  messages: MessageRow[]
  assetTypes: AssetType[]
  customFields: CustomFieldDefinition[]
  clients: ClientRow[]
  contacts: ContactRow[]
  locations: LocationRow[]
  assets: AssetRow[]
  jobs: JobRow[]
  assignments: AssignmentRow[]
  history: HistoryRow[]
  checklistItems: ChecklistItemRow[]
  reports: ReportRow[]
  materials: MaterialRow[]
  catalogItems: CatalogItem[]
  attachments: AttachmentRow[]
  /** Last job number per year. */
  jobSequence: Record<string, number>
  usage: Usage[]
  routePlans: RoutePlan[]
}

export interface MockDb {
  schemaVersion: typeof MOCK_DB_SCHEMA_VERSION
  /** Tenant-local date (Europe/Zagreb) the data was seeded for. */
  seedDate: string
  users: UserRow[]
  memberships: MembershipRow[]
  refreshTokens: RefreshTokenRow[]
  loginThrottle: LoginThrottleRow[]
  idempotency: IdempotencyRow[]
  tenants: Record<string, TenantData>
}
