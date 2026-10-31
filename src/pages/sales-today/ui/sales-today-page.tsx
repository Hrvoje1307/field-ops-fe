import { useTranslation } from 'react-i18next'

import { MailboxAttention } from '@/features/mailbox/attention'
import { SalesTodayView } from '@/features/sales/today'

export function SalesTodayPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('sales.pages.today')}</h1>
      <MailboxAttention />
      <SalesTodayView />
    </div>
  )
}
