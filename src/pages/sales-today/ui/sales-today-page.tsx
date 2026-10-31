import { useTranslation } from 'react-i18next'

import { MailboxAttention } from '@/features/mailbox/attention'
import { PagePlaceholder } from '@/shared/ui/page-placeholder'

export function SalesTodayPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <MailboxAttention />
      <PagePlaceholder title={t('sales.pages.today')}>
        <p>{t('sales.soon')}</p>
      </PagePlaceholder>
    </div>
  )
}
