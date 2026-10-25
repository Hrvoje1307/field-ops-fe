import { z } from 'zod'

import type {
  CustomFieldDefinition,
  CustomFieldDefinitionInput,
  CustomFieldEntity,
  CustomFieldType,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'
import { toKey, uniqueKey } from '@/shared/lib/slug'

/** One choice of a select field. `value` is what is stored; empty until a new option is saved. */
export interface OptionFormValue {
  value: string
  label: string
}

export interface DefinitionFormValues {
  label: string
  key: string
  type: CustomFieldType
  /** Equipment only: the type the field belongs to; empty for every type. */
  assetTypeId: string
  options: OptionFormValue[]
  required: boolean
  isSensitive: boolean
}

/** The contract's pattern for a key. */
export const FIELD_KEY = /^[a-z][a-z0-9_]{0,62}$/

export const FIELD_TYPES: readonly CustomFieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
]

export const hasOptions = (type: CustomFieldType) => type === 'select' || type === 'multiselect'

export function buildDefinitionSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      label: z.string().trim().min(1, t('settings.customFields.errors.labelRequired')),
      key: z.string().trim().regex(FIELD_KEY, t('settings.customFields.errors.keyInvalid')),
      type: z.enum(FIELD_TYPES),
      assetTypeId: z.string(),
      options: z.array(
        z.object({
          value: z.string(),
          label: z.string().trim().min(1, t('settings.customFields.errors.optionRequired')),
        }),
      ),
      required: z.boolean(),
      isSensitive: z.boolean(),
    })
    .superRefine((values, context) => {
      if (!hasOptions(values.type)) return
      if (values.options.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: t('settings.customFields.errors.optionsRequired'),
        })
        return
      }
      const seen = new Set<string>()
      values.options.forEach((option, index) => {
        const label = option.label.trim().toLowerCase()
        if (label !== '' && seen.has(label)) {
          context.addIssue({
            code: 'custom',
            path: ['options', index, 'label'],
            message: t('settings.customFields.errors.optionDuplicate'),
          })
        }
        seen.add(label)
      })
    })
}

/** A new field is text, optional, with no options; a stored one shows what it has. */
export function definitionFormValues(definition?: CustomFieldDefinition): DefinitionFormValues {
  if (!definition) {
    return {
      label: '',
      key: '',
      type: 'text',
      assetTypeId: '',
      options: [],
      required: false,
      isSensitive: false,
    }
  }
  return {
    label: definition.label,
    key: definition.key,
    type: definition.type,
    assetTypeId: definition.assetTypeId ?? '',
    options: (definition.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
    })),
    required: definition.required,
    isSensitive: definition.isSensitive,
  }
}

/**
 * The request. Options that are new get a stored value made from their label (never one
 * that exists); options that were there keep theirs, even when renamed. Options only
 * go with select types, and the asset type only with equipment.
 */
export function toDefinitionBody(
  values: DefinitionFormValues,
  context: { entity: CustomFieldEntity; sortOrder: number },
): CustomFieldDefinitionInput {
  const taken = new Set(
    values.options.map((option) => option.value).filter((value) => value !== ''),
  )
  const options = hasOptions(values.type)
    ? values.options.map((option) => {
        if (option.value !== '') return { value: option.value, label: option.label.trim() }
        const value = uniqueKey(toKey(option.label, 40) || 'opcija', taken, 40)
        taken.add(value)
        return { value, label: option.label.trim() }
      })
    : null
  return {
    entity: context.entity,
    assetTypeId:
      context.entity === 'asset' && values.assetTypeId !== '' ? values.assetTypeId : null,
    key: values.key.trim(),
    label: values.label.trim(),
    type: values.type,
    options,
    required: values.required,
    isSensitive: values.isSensitive,
    sortOrder: context.sortOrder,
  }
}

/** Where a new field goes: after the last one, with room to move others between. */
export function nextSortOrder(definitions: readonly { sortOrder: number }[]): number {
  return definitions.reduce((max, definition) => Math.max(max, definition.sortOrder), 0) + 10
}
