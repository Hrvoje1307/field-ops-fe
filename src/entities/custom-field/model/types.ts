import type { CustomFieldEntity } from '@/shared/api/generated/model'

/** What an input holds: text, number and date as typed text; select `''` when empty. */
export type PlainFormValue = string | string[] | boolean

/**
 * A sensitive field in the form. `masked` while the stored value was not revealed:
 * then it is left out of the request and the server keeps it. `hadValue`: the
 * stored value was visible, so emptying it after revealing sends `null` (clear).
 */
export interface SensitiveFormValue {
  masked: boolean
  hadValue: boolean
  value: PlainFormValue
}

export type CustomFieldFormValue = PlainFormValue | SensitiveFormValue

/** Form state of all custom fields of one entity, by definition key. */
export type CustomFieldFormValues = Record<string, CustomFieldFormValue>

/** Which definitions apply. Asset fields depend on the asset type. */
export type CustomFieldScope =
  { entity: Exclude<CustomFieldEntity, 'asset'> } | { entity: 'asset'; assetTypeId: string }

export function isSensitiveFormValue(value: unknown): value is SensitiveFormValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'masked' in value
}
