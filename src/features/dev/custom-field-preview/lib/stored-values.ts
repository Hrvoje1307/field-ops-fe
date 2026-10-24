import type { CustomFieldDefinition, CustomFieldValues } from '@/entities/custom-field'

/**
 * What the server would store for a request's `customFields` (the semantics the mock
 * implements): the object replaces the stored one, an omitted sensitive key keeps
 * its stored value, `null` clears.
 */
export function storedValues(
  definitions: readonly CustomFieldDefinition[],
  previous: CustomFieldValues | undefined,
  request: CustomFieldValues,
): CustomFieldValues {
  const result: CustomFieldValues = {}
  for (const definition of definitions) {
    const { key } = definition
    const value =
      key in request ? request[key] : definition.isSensitive ? previous?.[key] : undefined
    if (value !== undefined && value !== null) result[key] = value
  }
  return result
}
