import { useTranslation } from 'react-i18next'

import { PagePlaceholder } from '@/shared/ui/page-placeholder'

export function SettingsMailboxesPage() {
  const { t } = useTranslation()
  return (
    <PagePlaceholder title={t('sales.settingsPages.mailboxes')}>
      <p>{t('sales.soon')}</p>
    </PagePlaceholder>
  )
}
