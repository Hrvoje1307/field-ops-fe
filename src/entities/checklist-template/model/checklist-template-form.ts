import { z } from 'zod'

import type { ChecklistTemplate, ChecklistTemplateInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface ChecklistItemFormValue {
  label: string
  required: boolean
}

export interface ChecklistTemplateFormValues {
  name: string
  items: ChecklistItemFormValue[]
}

export function buildChecklistTemplateSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    name: z.string().trim().min(1, t('settings.checklists.errors.nameRequired')),
    items: z
      .array(
        z.object({
          label: z.string().trim().min(1, t('settings.checklists.errors.labelRequired')),
          required: z.boolean(),
        }),
      )
      .min(1, t('settings.checklists.errors.itemsRequired')),
  })
}

export const emptyChecklistItem: ChecklistItemFormValue = { label: '', required: false }

/** A new template starts with one empty row; a stored one with its items. */
export function checklistTemplateFormValues(
  template?: ChecklistTemplate,
): ChecklistTemplateFormValues {
  if (!template) return { name: '', items: [{ ...emptyChecklistItem }] }
  return {
    name: template.name,
    items: template.items.map((item) => ({ label: item.label, required: item.required ?? false })),
  }
}

export function toChecklistTemplateBody(
  values: ChecklistTemplateFormValues,
): ChecklistTemplateInput {
  return {
    name: values.name.trim(),
    items: values.items.map((item) => ({ label: item.label.trim(), required: item.required })),
  }
}

/** Moves the item at `index` one place up (-1) or down (+1); the same list at the ends. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  const moved = items[index]
  const other = items[target]
  if (moved === undefined || other === undefined) return [...items]
  const result = [...items]
  result[index] = other
  result[target] = moved
  return result
}
