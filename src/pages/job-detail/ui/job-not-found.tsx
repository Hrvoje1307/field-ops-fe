import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shared/ui/button'

export function JobNotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t('job.detail.notFound')}</h1>
      <p className="text-muted-foreground">{t('job.detail.notFoundDescription')}</p>
      <Button asChild variant="outline">
        <Link to="/jobs">{t('job.detail.back')}</Link>
      </Button>
    </div>
  )
}
