import { useTranslation } from 'react-i18next'

import { QuickJobForm } from '@/features/job/quick-create'

export function JobCreatePage({ clientId }: { clientId?: string }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('job.create.title')}</h1>
      <QuickJobForm clientId={clientId} />
    </div>
  )
}
