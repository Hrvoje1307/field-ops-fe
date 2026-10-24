import type { FieldErrors } from '@/shared/api/api-error'

/** `contacts[0].phone` → `contacts.0.phone` (the API writes indexes in brackets). */
const dotted = (path: string) => path.replace(/\[(\d+)\]/g, '.$1')

/** Where a `POST /clients` error belongs in the form. */
export function clientErrorPath(path: string, { isCompany }: { isCompany: boolean }): string {
  const field = dotted(path)
  if (field.startsWith('firstLocation.')) return `location.${field.slice('firstLocation.'.length)}`
  if (field === 'contacts.0.phone') return 'client.phone'
  if (field === 'contacts.0.email') return 'client.email'
  if (field === 'contacts.0.name') return isCompany ? 'client.contactName' : 'client.name'
  return `client.${field}`
}

/** Where a `POST /clients/{id}/locations` error belongs in the form. */
export function locationErrorPath(path: string): string {
  return `location.${dotted(path)}`
}

/** Where a `POST /jobs` error belongs in the form. */
export function jobErrorPath(path: string): string {
  const field = dotted(path)
  if (field === 'clientId') return 'client.clientId'
  if (field === 'locationId') return 'location.locationId'
  if (field === 'assetId') return 'assetId'
  return `job.${field}`
}

/** The API's field errors re-keyed by form path (messages for the same field joined). */
export function toFormErrors(errors: FieldErrors, toPath: (path: string) => string): FieldErrors {
  const result: FieldErrors = {}
  for (const [path, messages] of Object.entries(errors)) {
    const target = toPath(path)
    result[target] = [...(result[target] ?? []), ...messages]
  }
  return result
}

const CLIENT_FIELDS = ['clientId', 'type', 'name', 'contactName', 'phone', 'email', 'oib']
const LOCATION_FIELDS = [
  'locationId',
  'street',
  'city',
  'postalCode',
  'label',
  'accessNotes',
  'accessCodes',
]
const JOB_FIELDS = [
  'jobTypeId',
  'title',
  'description',
  'priority',
  'source',
  'preferredDate',
  'windowStart',
  'windowEnd',
  'durationMin',
  'requiredPeople',
  'internalNote',
]

/** Every input of the form, by path: server errors on other paths go to a toast. */
export function formFieldPaths(customFieldPaths: {
  client: string[]
  location: string[]
  job: string[]
}): string[] {
  return [
    ...CLIENT_FIELDS.map((field) => `client.${field}`),
    ...customFieldPaths.client,
    ...LOCATION_FIELDS.map((field) => `location.${field}`),
    ...customFieldPaths.location,
    'assetId',
    ...JOB_FIELDS.map((field) => `job.${field}`),
    ...customFieldPaths.job,
  ]
}
