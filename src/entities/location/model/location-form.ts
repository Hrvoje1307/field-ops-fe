import { z } from 'zod'

import type { CustomFieldValues, Location, LocationInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

import {
  type AccessCodesFormValue,
  accessCodesForRequest,
  accessCodesFormValue,
} from '../lib/access-codes'

export interface LocationFormValues<CustomFields> {
  street: string
  city: string
  postalCode: string
  label: string
  accessNotes: string
  accessCodes: AccessCodesFormValue
  customFields: CustomFields
}

const text = () => z.string().trim()

/** A location's fields; the custom-fields schema comes from the caller. */
export function buildLocationSchema<CustomFieldsInput>(
  customFields: z.ZodType<CustomFieldValues, CustomFieldsInput>,
) {
  const t = i18n.t.bind(i18n)
  return z.object({
    street: text().min(1, t('location.errors.streetRequired')),
    city: text().min(1, t('location.errors.cityRequired')),
    postalCode: text(),
    label: text(),
    accessNotes: text(),
    accessCodes: z.object({ masked: z.boolean(), hadValue: z.boolean(), value: z.string() }),
    customFields,
  })
}

export function locationFormValues<CustomFields>(
  location: Location | undefined,
  customFields: CustomFields,
): LocationFormValues<CustomFields> {
  return {
    street: location?.street ?? '',
    city: location?.city ?? '',
    postalCode: location?.postalCode ?? '',
    label: location?.label ?? '',
    accessNotes: location?.accessNotes ?? '',
    accessCodes: accessCodesFormValue(location),
    customFields,
  }
}

const orNull = (value: string) => (value === '' ? null : value)

/**
 * `LocationInput` (full replacement). The country stays the location's own on edit
 * (the tenant's for a new one; left to the API's default when unknown).
 */
export function toLocationBody(
  values: LocationFormValues<CustomFieldValues>,
  country: string | undefined,
): LocationInput {
  return {
    street: values.street,
    city: values.city,
    postalCode: orNull(values.postalCode),
    label: orNull(values.label),
    accessNotes: orNull(values.accessNotes),
    accessCodes: accessCodesForRequest(values.accessCodes),
    ...(country ? { country } : {}),
    customFields: values.customFields,
  }
}
