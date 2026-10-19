import type { ContactInput, LocationInput } from '@/shared/api/generated/model'
import { countryFromLocale, normalizePhone } from '@/shared/lib/phone'

import type { ContactRow, LocationRow, TenantData } from '../db/rows'
import { canSeeLocationSecrets, type Viewer } from './access'
import { validateCustomFields } from './custom-fields'
import { newId } from './ids'
import { type FieldErrors, MESSAGES } from './problems'

const CITY_CENTRES: Record<string, [number, number]> = {
  zagreb: [45.813, 15.978],
  split: [43.508, 16.44],
  solin: [43.539, 16.494],
  samobor: [45.802, 15.711],
}

/** Deterministic fake geocoding: a point near the city centre derived from the street. */
export function fakeGeocode(street: string, city: string): { lat: number; lng: number } {
  const [lat, lng] = CITY_CENTRES[city.trim().toLowerCase()] ?? [45.1, 15.2]
  let hash = 0
  for (const char of street) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
  const jitter = (n: number) => ((n % 1000) / 1000 - 0.5) * 0.04
  return {
    lat: Math.round((lat + jitter(hash)) * 1e6) / 1e6,
    lng: Math.round((lng + jitter(hash >> 10)) * 1e6) / 1e6,
  }
}

export const tenantCountry = (t: TenantData) => countryFromLocale(t.tenant.locale)

/** LocationInput → stored fields (full replacement; `accessCodes` omitted = keep, null = clear). */
export function applyLocationInput(
  t: TenantData,
  input: LocationInput,
  errors: FieldErrors,
  { path, viewer, previous }: { path: string; viewer: Viewer; previous?: LocationRow },
): Pick<
  LocationRow,
  | 'label'
  | 'street'
  | 'city'
  | 'postalCode'
  | 'country'
  | 'lat'
  | 'lng'
  | 'geocodeStatus'
  | 'accessNotes'
  | 'accessCodes'
  | 'customFields'
> {
  const prefix = path ? `${path}.` : ''
  const hasCoordinates =
    input.lat !== null && input.lat !== undefined && input.lng !== null && input.lng !== undefined
  if (
    (input.lat === null || input.lat === undefined) !==
    (input.lng === null || input.lng === undefined)
  ) {
    errors.add(
      `${prefix}${input.lat === null || input.lat === undefined ? 'lat' : 'lng'}`,
      MESSAGES.required,
    )
  }
  const coordinates = hasCoordinates
    ? { lat: input.lat ?? null, lng: input.lng ?? null }
    : fakeGeocode(input.street, input.city)
  const trimmedCodes = input.accessCodes?.trim()
  const accessCodes =
    input.accessCodes === undefined
      ? (previous?.accessCodes ?? null)
      : trimmedCodes === ''
        ? null
        : (trimmedCodes ?? null)

  return {
    label: input.label ?? null,
    street: input.street.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode ?? null,
    country: (input.country ?? 'HR').toUpperCase(),
    ...coordinates,
    // Places coordinates count as a good geocode; the mock geocodes the rest immediately
    geocodeStatus: 'ok',
    accessNotes: input.accessNotes ?? null,
    accessCodes,
    customFields: validateCustomFields(t, 'location', input.customFields, errors, {
      path: `${prefix}customFields`,
      previous: previous?.customFields,
      canSeeSensitive: previous ? canSeeLocationSecrets(t, viewer, previous.id) : true,
    }),
  }
}

/**
 * Contacts sync: items with `id` update that contact, without `id` are created,
 * missing ones are soft-deleted. Phones are normalised to E.164 in the tenant's country.
 */
export function applyContacts(
  t: TenantData,
  clientId: string,
  inputs: ContactInput[],
  errors: FieldErrors,
): { upserts: ContactRow[]; removedIds: string[] } {
  const country = tenantCountry(t)
  const existing = t.contacts.filter((c) => c.clientId === clientId && !c.deletedAt)
  const primaryCount = inputs.filter((c) => c.isPrimary).length

  const upserts = inputs.map((input, index): ContactRow => {
    const path = `contacts[${String(index)}]`
    if (input.id && !existing.some((c) => c.id === input.id))
      errors.add(`${path}.id`, MESSAGES.notFound)

    let phone: string | null = null
    if (input.phone?.trim()) {
      phone = normalizePhone(input.phone, country)
      if (!phone) errors.add(`${path}.phone`, MESSAGES.invalidPhone)
    }
    if (input.isPrimary && primaryCount > 1 && inputs.findIndex((c) => c.isPrimary) !== index) {
      errors.add(`${path}.isPrimary`, 'Samo jedan kontakt može biti glavni.')
    }
    return {
      id: input.id ?? newId(),
      clientId,
      name: input.name.trim(),
      phone,
      email: input.email ?? null,
      // No primary given: the first contact becomes primary
      isPrimary: primaryCount === 0 ? index === 0 : Boolean(input.isPrimary),
      receivesSms: input.receivesSms ?? true,
      deletedAt: null,
    }
  })
  const keptIds = new Set(upserts.map((c) => c.id))
  return { upserts, removedIds: existing.filter((c) => !keptIds.has(c.id)).map((c) => c.id) }
}
