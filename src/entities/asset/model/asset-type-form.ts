import { z } from 'zod'

import type { AssetType, AssetTypeInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface AssetTypeFormValues {
  name: string
  icon: string
}

export function buildAssetTypeSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    name: z.string().trim().min(1, t('settings.equipmentTypes.errors.nameRequired')),
    icon: z.string().trim(),
  })
}

export function assetTypeFormValues(assetType?: AssetType): AssetTypeFormValues {
  return { name: assetType?.name ?? '', icon: assetType?.icon ?? '' }
}

/** The icon is the API's own word for a picture; it is kept as it is and cleared when emptied. */
export function toAssetTypeBody(values: AssetTypeFormValues): AssetTypeInput {
  return { name: values.name.trim(), icon: values.icon.trim() === '' ? null : values.icon.trim() }
}
