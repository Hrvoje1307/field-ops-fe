/**
 * Shape of the seed definitions (tenant files are plain data).
 * Names refer to other seed entries; the builder resolves them to ids.
 */
import type {
  ClientType,
  CustomFieldEntity,
  CustomFieldType,
  CustomFieldValues,
  JobSource,
  JobStatus,
  Priority,
  Role,
  TenantSettings,
  TenantPlan,
} from '@/shared/api/generated/model'

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
  members: { user: string; role: Role }[]
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
  usage: { smsCount: number; smsCost: string; emailCount: number; optimizationsCount: number }
}
