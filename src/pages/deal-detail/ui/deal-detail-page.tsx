import { useTranslation } from 'react-i18next'

import { PagePlaceholder } from '@/shared/ui/page-placeholder'

export function DealDetailPage({ dealId }: { dealId: string }) {
  const { t } = useTranslation()
  return (
    <PagePlaceholder title={t('sales.pages.deal')}>
      <p data-deal-id={dealId}>{t('sales.soon')}</p>
    </PagePlaceholder>
  )
}
