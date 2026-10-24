import type {
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldValues,
} from '@/shared/api/generated/model'

import type { TenantData } from '../db/rows'
import { type FieldErrors, MESSAGES } from './problems'

/** Definitions for an entity; asset fields apply to their asset type or (null) to all types. */
export function definitionsFor(
  t: TenantData,
  entity: CustomFieldEntity,
  assetTypeId?: string | null,
): CustomFieldDefinition[] {
  return t.customFields
    .filter(
      (d) =>
        d.entity === entity &&
        (entity !== 'asset' ||
          d.assetTypeId === null ||
          d.assetTypeId === undefined ||
          d.assetTypeId === assetTypeId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

function isValidPlainDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function checkValue(definition: CustomFieldDefinition, value: unknown): string | null {
  const options = (definition.options ?? []).map((o) => o.value)
  switch (definition.type) {
    case 'text':
    case 'textarea':
      return typeof value === 'string' ? null : MESSAGES.invalid
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : MESSAGES.invalid
    case 'date':
      return isValidPlainDate(value) ? null : MESSAGES.invalidDate
    case 'checkbox':
      return typeof value === 'boolean' ? null : MESSAGES.invalid
    case 'select':
      return typeof value === 'string' && options.includes(value) ? null : MESSAGES.notAllowed
    case 'multiselect':
      if (
        !Array.isArray(value) ||
        !value.every((v) => typeof v === 'string' && options.includes(v))
      ) {
        return MESSAGES.notAllowed
      }
      return new Set(value).size === value.length ? null : MESSAGES.duplicateItems
  }
}

interface ValidateOptions {
  /** Field path prefix, e.g. `customFields` or `firstLocation.customFields`. */
  path: string
  assetTypeId?: string | null
  /** Stored values (on update). */
  previous?: CustomFieldValues
}

/**
 * Values checked against their definitions (type, required, options); returns what to store.
 * The object replaces the stored one, except sensitive fields: an omitted sensitive key keeps
 * the stored value (the client never revealed it, or can't see it); `null` or `""` clears it.
 */
export function validateCustomFields(
  t: TenantData,
  entity: CustomFieldEntity,
  values: CustomFieldValues | undefined,
  errors: FieldErrors,
  { path, assetTypeId, previous }: ValidateOptions,
): CustomFieldValues {
  const definitions = definitionsFor(t, entity, assetTypeId)
  const input = values ?? {}
  const result: CustomFieldValues = {}

  for (const key of Object.keys(input)) {
    if (!definitions.some((d) => d.key === key)) errors.add(`${path}.${key}`, MESSAGES.unknownField)
  }

  for (const definition of definitions) {
    const value = input[definition.key]
    if (value === undefined && definition.isSensitive && previous?.[definition.key] !== undefined) {
      result[definition.key] = previous[definition.key]
      continue
    }
    if (isEmpty(value)) {
      if (definition.required) errors.add(`${path}.${definition.key}`, MESSAGES.required)
      continue
    }
    const problem = checkValue(definition, value)
    if (problem) errors.add(`${path}.${definition.key}`, problem)
    else result[definition.key] = value
  }
  return result
}

/** Values the viewer may see: only defined fields (deleted ones are hidden), sensitive ones only if allowed. */
export function visibleCustomFields(
  t: TenantData,
  entity: CustomFieldEntity,
  values: CustomFieldValues | undefined,
  canSeeSensitive: boolean,
  assetTypeId?: string | null,
): CustomFieldValues {
  const visible: CustomFieldValues = {}
  for (const definition of definitionsFor(t, entity, assetTypeId)) {
    const value = values?.[definition.key]
    if (value === undefined || (definition.isSensitive && !canSeeSensitive)) continue
    visible[definition.key] = value
  }
  return visible
}
