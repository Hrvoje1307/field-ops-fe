import { z } from 'zod'

import type { CustomFieldDefinition, CustomFieldValues } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'
import { isPlainDate } from '@/shared/lib/datetime'
import { parseInputNumber } from '@/shared/lib/number'

import { removedOptions } from '../lib/definitions'
import {
  type CustomFieldFormValue,
  type CustomFieldFormValues,
  isSensitiveFormValue,
  type PlainFormValue,
} from './types'

interface Parsed {
  value?: unknown
  error?: string
}

/** Form value → API value; `{}` when empty, `{ error }` when invalid. */
export function parseCustomFieldValue(
  definition: CustomFieldDefinition,
  input: PlainFormValue | undefined,
): Parsed {
  const text = typeof input === 'string' ? input.trim() : ''
  switch (definition.type) {
    case 'text':
    case 'textarea':
      return text === '' ? {} : { value: text }
    case 'number': {
      if (text === '') return {}
      const number = parseInputNumber(text)
      return number === null ? { error: i18n.t('customField.errors.number') } : { value: number }
    }
    case 'date':
      if (text === '') return {}
      return isPlainDate(text) ? { value: text } : { error: i18n.t('customField.errors.date') }
    case 'select':
    case 'multiselect': {
      const removed = removedOptions(definition, input)
      if (removed.length > 0) {
        return {
          error: removed
            .map((value) => i18n.t('customField.errors.removedOption', { value }))
            .join(' '),
        }
      }
      if (definition.type === 'select') return text === '' ? {} : { value: text }
      const selected = Array.isArray(input) ? [...new Set(input)] : []
      return selected.length === 0 ? {} : { value: selected }
    }
    case 'checkbox':
      return { value: input === true }
  }
}

/**
 * One field: the value to send, `undefined` to leave the key out, or a validation issue.
 * Sensitive fields: masked (never revealed) → left out, the server keeps the stored value;
 * revealed and emptied → `null`, the server clears it.
 */
function fieldSchema(definition: CustomFieldDefinition, canSeeSensitive: boolean) {
  return z.custom<CustomFieldFormValue>().transform((input, ctx) => {
    const sensitive = definition.isSensitive && isSensitiveFormValue(input)
    if (sensitive && input.masked) return undefined

    const parsed = parseCustomFieldValue(
      definition,
      sensitive ? input.value : (input as PlainFormValue | undefined),
    )
    if (parsed.error !== undefined) {
      ctx.addIssue({ code: 'custom', message: parsed.error })
      return z.NEVER
    }
    if (parsed.value !== undefined) return parsed.value

    // The API may hide a stored sensitive value from this user: empty doesn't mean unset
    const mustFill = definition.required && (!definition.isSensitive || canSeeSensitive)
    if (mustFill) {
      ctx.addIssue({ code: 'custom', message: i18n.t('customField.errors.required') })
      return z.NEVER
    }
    return sensitive && input.hadValue ? null : undefined
  })
}

export interface CustomFieldsSchemaOptions {
  /**
   * False when the API may leave sensitive values out for this user (e.g. a technician
   * not assigned to the job): sensitive fields are then not required.
   */
  canSeeSensitive?: boolean
}

/**
 * Validation of the custom fields of one entity, built from the definitions. Nest it
 * under `customFields` in the form's schema; it outputs the request's `customFields`.
 */
export function buildCustomFieldsSchema(
  definitions: readonly CustomFieldDefinition[],
  { canSeeSensitive = true }: CustomFieldsSchemaOptions = {},
): z.ZodType<CustomFieldValues, CustomFieldFormValues> {
  const shape = Object.fromEntries(
    definitions.map((definition) => [definition.key, fieldSchema(definition, canSeeSensitive)]),
  )
  return z
    .object(shape)
    .transform((values): CustomFieldValues =>
      Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    )
}
