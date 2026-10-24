import { z } from 'zod'

import type { Asset, AssetInput, CustomFieldValues } from '@/shared/api/generated/model'
import { isPlainDate } from '@/shared/lib/datetime'
import { i18n } from '@/shared/i18n'

export interface AssetFormValues<CustomFields> {
  assetTypeId: string
  manufacturer: string
  model: string
  serialNo: string
  installedAt: string
  warrantyUntil: string
  notes: string
  customFields: CustomFields
}

const text = () => z.string().trim()

/** Equipment fields; the custom-fields schema (of the chosen type) comes from the caller. */
export function buildAssetSchema<CustomFieldsInput>(
  customFields: z.ZodType<CustomFieldValues, CustomFieldsInput>,
) {
  const t = i18n.t.bind(i18n)
  const date = () =>
    z.string().refine((value) => value === '' || isPlainDate(value), t('asset.errors.dateInvalid'))
  return z.object({
    assetTypeId: z.string().min(1, t('asset.errors.typeRequired')),
    manufacturer: text(),
    model: text(),
    serialNo: text(),
    installedAt: date(),
    warrantyUntil: date(),
    notes: text(),
    customFields,
  })
}

export function assetFormValues<CustomFields>(
  asset: Asset | undefined,
  customFields: CustomFields,
  assetTypeId = '',
): AssetFormValues<CustomFields> {
  return {
    assetTypeId: asset?.assetTypeId ?? assetTypeId,
    manufacturer: asset?.manufacturer ?? '',
    model: asset?.model ?? '',
    serialNo: asset?.serialNo ?? '',
    installedAt: asset?.installedAt ?? '',
    warrantyUntil: asset?.warrantyUntil ?? '',
    notes: asset?.notes ?? '',
    customFields,
  }
}

const orNull = (value: string) => (value === '' ? null : value)

/** `AssetInput` (full replacement). */
export function toAssetBody(values: AssetFormValues<CustomFieldValues>): AssetInput {
  return {
    assetTypeId: values.assetTypeId,
    manufacturer: orNull(values.manufacturer),
    model: orNull(values.model),
    serialNo: orNull(values.serialNo),
    installedAt: orNull(values.installedAt),
    warrantyUntil: orNull(values.warrantyUntil),
    notes: orNull(values.notes),
    customFields: values.customFields,
  }
}
