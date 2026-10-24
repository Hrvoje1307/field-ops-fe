import type { CustomFieldDefinition } from '@/shared/api/generated/model'

/**
 * Definitions in display order (`sortOrder`, then label), one per key. A field set for
 * one asset type wins over a same-key field that applies to every type.
 */
export function prepareDefinitions(
  definitions: readonly CustomFieldDefinition[],
): CustomFieldDefinition[] {
  const byKey = new Map<string, CustomFieldDefinition>()
  for (const definition of definitions) {
    const existing = byKey.get(definition.key)
    if (!existing || (!existing.assetTypeId && definition.assetTypeId)) {
      byKey.set(definition.key, definition)
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  )
}

/** Form paths of the fields, for mapping 400 errors (`customFields.zones`). */
export function customFieldPaths(
  definitions: readonly CustomFieldDefinition[],
  name = 'customFields',
): string[] {
  return definitions.map((definition) => `${name}.${definition.key}`)
}

/** Stored values whose option no longer exists (select and multiselect). */
export function removedOptions(definition: CustomFieldDefinition, value: unknown): string[] {
  if (definition.type !== 'select' && definition.type !== 'multiselect') return []
  const offered = new Set((definition.options ?? []).map((option) => option.value))
  const values = Array.isArray(value) ? value : [value]
  return values.filter(
    (item): item is string => typeof item === 'string' && item !== '' && !offered.has(item),
  )
}
