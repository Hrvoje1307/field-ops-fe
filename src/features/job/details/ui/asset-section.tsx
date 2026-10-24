import { useTranslation } from 'react-i18next'

import { type Asset, AssetSummary } from '@/entities/asset'
import { CustomFieldValuesFor } from '@/entities/custom-field'

import { Section } from './section'

/** The equipment the job is for, with the fields of its type, read-only. */
export function AssetSection({ asset }: { asset: Asset }) {
  const { t } = useTranslation()
  return (
    <Section title={t('job.detail.asset')}>
      <AssetSummary asset={asset} />
      <CustomFieldValuesFor
        scope={{ entity: 'asset', assetTypeId: asset.assetType.id }}
        values={asset.customFields}
      />
    </Section>
  )
}
