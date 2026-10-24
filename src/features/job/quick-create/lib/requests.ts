import type {
  ClientCreate,
  ContactInput,
  JobCreate,
  LocationInput,
} from '@/shared/api/generated/model'

import type { JobValues, NewClientValues, NewLocationValues } from '../model/schema'

const orNull = (value: string) => (value === '' ? null : value)

/**
 * `LocationInput` for a new location. The country is the tenant's (left to the API's
 * default when unknown); access codes are only sent when typed (write-only field).
 */
export function toLocationInput(
  location: NewLocationValues,
  country: string | undefined,
): LocationInput {
  return {
    street: location.street,
    city: location.city,
    postalCode: orNull(location.postalCode),
    label: orNull(location.label),
    accessNotes: orNull(location.accessNotes),
    ...(location.accessCodes ? { accessCodes: location.accessCodes } : {}),
    ...(country ? { country } : {}),
    customFields: location.customFields,
  }
}

/**
 * `ClientCreate` with its first location, in one request. The primary contact is the
 * person themselves, or a company's contact person (the company name when empty).
 */
export function toClientCreate(
  client: NewClientValues,
  location: NewLocationValues,
  country: string | undefined,
): ClientCreate {
  const contact: ContactInput = {
    name: client.type === 'company' && client.contactName ? client.contactName : client.name,
    phone: orNull(client.phone),
    email: orNull(client.email),
    isPrimary: true,
  }
  return {
    type: client.type,
    name: client.name,
    oib: orNull(client.oib),
    contacts: [contact],
    customFields: client.customFields,
    firstLocation: toLocationInput(location, country),
  }
}

/** `JobCreate`; duration and crew size are left out to take the job type's defaults. */
export function toJobCreate(
  job: JobValues,
  refs: { clientId: string; locationId: string; assetId: string },
): JobCreate {
  return {
    clientId: refs.clientId,
    locationId: refs.locationId,
    assetId: orNull(refs.assetId),
    jobTypeId: job.jobTypeId,
    title: job.title,
    description: orNull(job.description),
    priority: job.priority,
    source: job.source,
    preferredDate: orNull(job.preferredDate),
    windowStart: orNull(job.windowStart),
    windowEnd: orNull(job.windowEnd),
    ...(job.durationMin === undefined ? {} : { durationMin: job.durationMin }),
    ...(job.requiredPeople === undefined ? {} : { requiredPeople: job.requiredPeople }),
    internalNote: orNull(job.internalNote),
    customFields: job.customFields,
  }
}
