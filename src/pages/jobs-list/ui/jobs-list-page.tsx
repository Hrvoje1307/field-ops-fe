import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { JobList, type JobsSearch, type JobsSearchChange } from '@/features/job/list'
import { Button } from '@/shared/ui/button'

export function JobsListPage({
  search,
  onSearchChange,
}: {
  search: JobsSearch
  onSearchChange: JobsSearchChange
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('job.list.title')}</h1>
        <Button asChild>
          <Link to="/jobs/new">
            <PlusIcon aria-hidden="true" />
            {t('job.create.open')}
          </Link>
        </Button>
      </div>
      <JobList search={search} onSearchChange={onSearchChange} />
    </div>
  )
}
