import { useTranslation } from 'react-i18next'

import { JobList, type JobsSearch, type JobsSearchChange } from '@/features/job/list'

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
      <h1 className="text-2xl font-semibold tracking-tight">{t('job.list.title')}</h1>
      <JobList search={search} onSearchChange={onSearchChange} />
    </div>
  )
}
