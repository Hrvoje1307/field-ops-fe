import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import type { Asset } from '@/shared/api/generated/model'

/** Equipment in one line: type, manufacturer and model, serial number. */
export function AssetSummary({
  asset,
  className,
}: {
  asset: Pick<Asset, 'assetType' | 'manufacturer' | 'model' | 'serialNo'>
  className?: string
}) {
  const { t } = useTranslation()
  const makeAndModel = [asset.manufacturer, asset.model].filter(Boolean).join(' ')
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2 text-sm', className)}>
      <span className="font-medium">{asset.assetType.name}</span>
      {makeAndModel && <span>{makeAndModel}</span>}
      {asset.serialNo && (
        <span className="text-xs text-muted-foreground">
          {t('asset.serialNo', { serialNo: asset.serialNo })}
        </span>
      )}
    </span>
  )
}
