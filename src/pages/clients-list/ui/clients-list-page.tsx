import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/auth'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { PagePlaceholder } from '@/shared/ui/page-placeholder'

export function ClientsListPage() {
  const { t } = useTranslation()
  const me = useMe()
  const { formatDate, today } = useTenantFormat()
  return (
    <PagePlaceholder title={t('pages.clientsList.title')}>
      <p>
        {me.tenant.name} · {formatDate(today(), { dateStyle: 'full' })}
      </p>
      <p>{t('pages.placeholder')}</p>
    </PagePlaceholder>
  )
}
