import { z } from 'zod'

import type { JobMaterialInput } from '@/entities/report'
import { i18n } from '@/shared/i18n'

export type MaterialMode = 'catalog' | 'custom'

export interface MaterialFormValues {
  mode: MaterialMode
  catalogItemId: string
  name: string
  unit: string
  unitPrice: string
  quantity: string
}

export const emptyMaterialForm: MaterialFormValues = {
  mode: 'catalog',
  catalogItemId: '',
  name: '',
  unit: '',
  unitPrice: '',
  quantity: '1',
}

const QUANTITY = /^\d{1,9}([.,]\d{1,3})?$/
const PRICE = /^\d{1,10}([.,]\d{1,2})?$/

/** `12,5` → `12.5`: people type a decimal comma, the API takes a point. */
export const withPoint = (value: string) => value.trim().replace(',', '.')

export function buildMaterialSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      mode: z.enum(['catalog', 'custom']),
      catalogItemId: z.string(),
      name: z.string(),
      unit: z.string(),
      unitPrice: z.string(),
      quantity: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: keyof MaterialFormValues, message: string) => {
        context.addIssue({ code: 'custom', path: [path], message })
      }
      if (!QUANTITY.test(values.quantity.trim()) || !(Number(withPoint(values.quantity)) > 0)) {
        issue('quantity', t('report.materials.dialog.errors.quantityInvalid'))
      }
      if (values.mode === 'catalog') {
        if (values.catalogItemId === '') {
          issue('catalogItemId', t('report.materials.dialog.errors.catalogRequired'))
        }
        return
      }
      if (values.name.trim() === '') issue('name', t('report.materials.dialog.errors.nameRequired'))
      if (values.unit.trim() === '') issue('unit', t('report.materials.dialog.errors.unitRequired'))
      if (values.unitPrice.trim() !== '' && !PRICE.test(values.unitPrice.trim())) {
        issue('unitPrice', t('report.materials.dialog.errors.priceInvalid'))
      }
    })
}

/** The API's input: a catalog item (name, unit and price are copied) or free text. */
export function toMaterialInput(values: MaterialFormValues): JobMaterialInput {
  const quantity = withPoint(values.quantity)
  if (values.mode === 'catalog') return { catalogItemId: values.catalogItemId, quantity }
  const input: JobMaterialInput = {
    name: values.name.trim(),
    unit: values.unit.trim(),
    quantity,
  }
  if (values.unitPrice.trim() !== '') input.unitPrice = withPoint(values.unitPrice)
  return input
}
