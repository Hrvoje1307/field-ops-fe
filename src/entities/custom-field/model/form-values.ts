import type { CustomFieldDefinition, CustomFieldValues } from '@/shared/api/generated/model'
import { numberToInput } from '@/shared/lib/number'

import type { CustomFieldFormValues, PlainFormValue } from './types'

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/** A stored API value as the input shows it. Removed options are kept (with a warning). */
function toFormValue(
  definition: CustomFieldDefinition,
  stored: unknown,
  locale: string,
): PlainFormValue {
  switch (definition.type) {
    case 'number':
      if (typeof stored === 'number') return numberToInput(stored, locale)
      return typeof stored === 'string' ? stored : ''
    case 'multiselect':
      return Array.isArray(stored) ? stored.map(String) : []
    case 'checkbox':
      return stored === true
    case 'text':
    case 'textarea':
    case 'date':
    case 'select':
      return isBlank(stored) ? '' : String(stored)
  }
}

/** Initial form values from the API's values (sensitive ones start masked). */
export function customFieldFormValues(
  definitions: readonly CustomFieldDefinition[],
  values: CustomFieldValues | undefined,
  { locale }: { locale: string },
): CustomFieldFormValues {
  const result: CustomFieldFormValues = {}
  for (const definition of definitions) {
    const stored = values?.[definition.key]
    const value = toFormValue(definition, stored, locale)
    if (definition.isSensitive) {
      const hadValue = !isBlank(stored)
      result[definition.key] = { masked: hadValue, hadValue, value }
    } else {
      result[definition.key] = value
    }
  }
  return result
}
