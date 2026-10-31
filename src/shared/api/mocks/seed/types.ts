/**
 * Shape of the seed definitions (tenant files are plain data).
 * Names refer to other seed entries; the builder resolves them to ids.
 */
import type {
  AiStatus,
  ClientType,
  CustomFieldEntity,
  CustomFieldType,
  CustomFieldValues,
  DealActivityType,
  DealSource,
  DraftKind,
  DraftStatus,
  JobSource,
  JobStatus,
  LostReason,
  MailboxKind,
  MailboxStatus,
  MailProvider,
  MessageChannel,
  MessageTemplateKey,
  Priority,
  Role,
  SalesStageKind,
  TenantSettings,
  TenantPlan,
  ThreadCategory,
  Usage,
} from '@/shared/api/generated/model'

import type { SalesSettingsRow } from '../db/sales-rows'

export interface UserSeed {
  key: string
  email: string
  fullName: string
  phone: string | null
}

export interface AssetSeed {
  key?: string
  type: string
  manufacturer: string
  model: string
  serialNo: string
  installedYearsAgo?: number
  warrantyYears?: number
  notes?: string
  customFields?: CustomFieldValues
}

export interface LocationSeed {
  label?: string
  street: string
  city: string
  postalCode: string
  lat: number
  lng: number
  accessNotes?: string
  accessCodes?: string
  customFields?: CustomFieldValues
  assets?: AssetSeed[]
}

export interface ClientSeed {
  key: string
  type: ClientType
  name: string
  oib?: string
  email?: string
  notes?: string
  createdDaysAgo: number
  customFields?: CustomFieldValues
  /** The first contact is the primary one. */
  contacts: { name: string; phone?: string; email?: string; receivesSms?: boolean }[]
  locations: LocationSeed[]
}

export interface JobSeed {
  client: string
  /** Index into the client's locations (default 0). */
  location?: number
  asset?: string
  type: string
  title: string
  status: JobStatus
  /** Days from today (negative = past). Omitted = unscheduled. */
  day?: number
  time?: string
  /** Technician user keys; the first one is the lead. */
  techs?: string[]
  priority?: Priority
  source?: JobSource
  description?: string
  internalNote?: string
  /** on_hold / cancel reason */
  reason?: string
  preferredInDays?: number
  window?: [string, string]
  rescheduleNote?: string
  workDone?: string
  /** Materials used by a completed job: catalog SKU and quantity. */
  materials?: { sku: string; quantity: string }[]
  customFields?: CustomFieldValues
  createdDaysAgo?: number
  locked?: boolean
}

export interface CustomFieldSeed {
  entity: CustomFieldEntity
  key: string
  label: string
  type: CustomFieldType
  assetType?: string
  options?: { value: string; label: string }[]
  required?: boolean
  isSensitive?: boolean
}

export interface TenantSeed {
  name: string
  slug: string
  oib: string
  address: string
  phone: string
  email: string
  iban: string
  locale: string
  timezone: string
  currency: string
  plan: TenantPlan
  settings: TenantSettings
  members: { user: string; role: Role; canAccessSales?: boolean }[]
  depot: {
    name: string
    address: string
    lat: number
    lng: number
    opensAt: string
    closesAt: string
  }
  skills: string[]
  technicians: { user: string; color: string; skills: string[] }[]
  catalog: { sku: string; name: string; unit: string; price: string }[]
  checklists: { name: string; items: { label: string; required?: boolean }[] }[]
  /** Templates the tenant has customised; everything else is a platform default. */
  messageTemplates: {
    key: MessageTemplateKey
    channel: MessageChannel
    body: string
    subject?: string | null
    isActive?: boolean
  }[]
  jobTypes: {
    name: string
    color: string
    minutes: number
    people: number
    skills?: string[]
    checklist?: string
  }[]
  assetTypes: { name: string; icon: string }[]
  customFields: CustomFieldSeed[]
  clients: ClientSeed[]
  jobs: JobSeed[]
  invitations?: { email: string; role: Role; daysAgo: number }[]
  usage: Omit<Usage, 'month'>
  /** Plan add-ons: `sales`, `sales_ai`. */
  extraFeatures?: string[]
  sales?: SalesSeed
}

// --- Sales -------------------------------------------------------------------------

export interface MailboxSeed {
  key: string
  provider: MailProvider
  address: string
  name: string
  kind: MailboxKind
  /** User key of a personal mailbox's owner. */
  owner?: string
  status?: MailboxStatus
  lastError?: string
  canSend?: boolean
  syncedMinutesAgo?: number
}

export interface StageSeed {
  name: string
  color: string
  kind: SalesStageKind
  followUpDays?: number
  staleAfterDays?: number
}

export interface DealSeed {
  key: string
  title: string
  /** Index into the tenant's stages. */
  stage: number
  /** Client key; the deal's contact is then the client's primary contact unless `contact` is set. */
  client?: string
  contact?: [name: string, email: string, phone?: string]
  value?: string
  /** User key; null = nobody. Default: the first office user. */
  owner?: string | null
  source?: DealSource
  createdDaysAgo: number
  lastContactDaysAgo?: number
  /** Days from today the follow-up is due (negative = overdue). */
  followUpInDays?: number
  lost?: { reason: LostReason; note?: string; daysAgo: number }
  wonDaysAgo?: number
  /** The deal was converted: it holds the first job of its client. */
  converted?: boolean
  notes?: string
  expectedCloseInDays?: number
  activities?: {
    type: DealActivityType
    daysAgo: number
    text?: string
    /** A user key, or `ai` / `system` */
    actor?: string
  }[]
}

export interface MessageSeed {
  /** inbound from the thread's contact, or outbound from its mailbox */
  d: 'in' | 'out'
  /** Hours ago. */
  ago: number
  text: string
  /** Only these mailboxes have the message (default: all of the thread's). */
  mb?: string[]
  files?: [name: string, mime: string, size: number][]
}

export interface ThreadSeed {
  key: string
  /** Mailbox keys that hold the conversation. */
  mb: string[]
  subject: string
  who: [name: string, email: string]
  client?: string
  deal?: string
  cat?: ThreadCategory
  conf?: number
  /** A user corrected the AI (category and sales flag are theirs). */
  byUser?: boolean
  ai?: AiStatus
  excluded?: boolean
  summary?: string
  next?: string
  /** Index into the stages. */
  stage?: number
  msgs: MessageSeed[]
}

export interface DraftSeed {
  thread: string
  mb: string
  kind: DraftKind
  status: DraftStatus
  /** Minutes ago. */
  ago: number
  body: string
  subject?: string
  instructions?: string
  error?: string
  by?: string
  rule?: number
}

export interface SalesSeed {
  mailboxes: MailboxSeed[]
  stages: StageSeed[]
  rules: { name: string; stage?: number; days: number; createDraft: boolean; isActive?: boolean }[]
  settings: Partial<Omit<SalesSettingsRow, 'digestRecipientIds'>> & { digestRecipients?: string[] }
  exclusions: { pattern: string; note?: string; daysAgo: number }[]
  deals: DealSeed[]
  threads: ThreadSeed[]
  drafts: DraftSeed[]
  usage: Pick<Usage, 'aiClassifications' | 'aiDrafts' | 'aiInputTokens' | 'aiOutputTokens'>
}
