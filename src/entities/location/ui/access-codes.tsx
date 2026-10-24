import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import type { Location } from '@/shared/api/generated/model'
import { SensitiveValue } from '@/shared/ui/sensitive-value'

/**
 * Secret access codes, masked until revealed. The API leaves `accessCodes` out for
 * viewers who may not see them; `hasAccessCodes` still tells that codes exist.
 */
export function AccessCodes({
  location,
  size,
  className,
}: {
  location: Pick<Location, 'accessCodes' | 'hasAccessCodes'>
  size?: 'sm' | 'lg'
  className?: string
}) {
  const { t } = useTranslation()
  const codes = location.accessCodes?.trim()
  if (codes) {
    return (
      <SensitiveValue label={t('location.accessCodes')} size={size} className={className}>
        <span className="whitespace-pre-line">{location.accessCodes}</span>
      </SensitiveValue>
    )
  }
  if (location.hasAccessCodes) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('location.accessCodesHidden')}
      </p>
    )
  }
  return null
}
