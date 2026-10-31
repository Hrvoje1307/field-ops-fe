import { useTranslation } from 'react-i18next'

import { PagePlaceholder } from '@/shared/ui/page-placeholder'

export function SettingsSalesAiPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PagePlaceholder title={t('sales.settingsPages.ai')}>
        <p>{t('sales.soon')}</p>
      </PagePlaceholder>
    </div>
  )
}
