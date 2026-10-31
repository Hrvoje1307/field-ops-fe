import { z } from 'zod'

import type { Deal, DealCreate } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'
import { isPlainDate } from '@/shared/lib/datetime'

export interface DealFormValues {
  title: string
  /** Empty = the API's first open stage (only when creating). */
  stageId: string
  contactName: string
  contactEmail: string
  contactPhone: string
  value: string
  expectedCloseDate: string
  notes: string
}

const text = () => z.string().trim()
const MONEY = /^\d{1,10}([.,]\d{1,2})?$/

/** The deal form. Paths mirror `DealCreate`, so 400 errors land on the inputs. */
export function buildDealSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    title: text().min(1, t('sales.deal.titleRequired')).max(200, t('sales.deal.titleRequired')),
    stageId: z.string(),
    contactName: text(),
    contactEmail: text().refine(
      (value) => value === '' || z.email().safeParse(value).success,
      t('sales.deal.emailInvalid'),
    ),
    contactPhone: text(),
    value: text().refine(
      (value) => value === '' || MONEY.test(value),
      t('sales.deal.valueInvalid'),
    ),
    expectedCloseDate: z
      .string()
      .refine((value) => value === '' || isPlainDate(value), t('sales.deal.dateInvalid')),
    notes: text(),
  })
}

/** Empty form, or the stored deal. `formatPhone` shows the number as people type it. */
export function dealFormValues(
  deal?: Deal,
  formatPhone: (e164: string) => string = (phone) => phone,
): DealFormValues {
  if (!deal) {
    return {
      title: '',
      stageId: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      value: '',
      expectedCloseDate: '',
      notes: '',
    }
  }
  return {
    title: deal.title,
    stageId: deal.stage.id,
    contactName: deal.contactName ?? '',
    contactEmail: deal.contactEmail ?? '',
    contactPhone: deal.contactPhone ? formatPhone(deal.contactPhone) : '',
    value: deal.value ? deal.value.replace('.', ',') : '',
    expectedCloseDate: deal.expectedCloseDate ?? '',
    notes: deal.notes ?? '',
  }
}

const orNull = (value: string) => (value === '' ? null : value)

/**
 * `DealCreate`. The amount stays a decimal string (a comma becomes a point). A deal made by
 * hand has source `manual`; an edit keeps the deal's own source and, when the form leaves
 * it empty, its owner.
 */
export function toDealBody(
  values: DealFormValues,
  options: { source: Deal['source']; ownerUserId?: string | null; keepStage?: boolean },
): DealCreate {
  return {
    title: values.title,
    ...(values.stageId && !options.keepStage ? { stageId: values.stageId } : {}),
    contactName: orNull(values.contactName),
    contactEmail: orNull(values.contactEmail),
    contactPhone: orNull(values.contactPhone),
    value: orNull(values.value.replace(',', '.')),
    expectedCloseDate: orNull(values.expectedCloseDate),
    ...(options.ownerUserId ? { ownerUserId: options.ownerUserId } : {}),
    source: options.source,
    notes: orNull(values.notes),
  }
}
