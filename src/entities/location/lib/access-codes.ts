import type { Location } from '@/shared/api/generated/model'

/**
 * Access codes in an edit form, like a sensitive custom field: masked until the user
 * reveals them, so an untouched form never sends them back.
 */
export interface AccessCodesFormValue {
  masked: boolean
  /** Codes were stored when the form opened. */
  hadValue: boolean
  value: string
}

export function accessCodesFormValue(
  location: Pick<Location, 'accessCodes' | 'hasAccessCodes'> | undefined,
): AccessCodesFormValue {
  const stored = location?.accessCodes ?? ''
  const hadValue = stored.trim() !== '' || location?.hasAccessCodes === true
  return { masked: hadValue, hadValue, value: stored }
}

/**
 * `LocationInput.accessCodes` (write-only): `null` keeps the stored codes, `""` removes
 * them, text replaces them. Masked → keep; revealed and emptied → remove.
 */
export function accessCodesForRequest(codes: AccessCodesFormValue): string | null {
  if (codes.masked) return null
  const value = codes.value.trim()
  if (value) return value
  return codes.hadValue ? '' : null
}
