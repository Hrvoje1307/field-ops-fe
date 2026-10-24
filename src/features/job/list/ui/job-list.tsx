import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { JOB_LIST_STALE_TIME, jobKeys, listJobs } from '@/entities/job'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import {
  CLEAR_FILTERS,
  hasActiveFilters,
  type JobsSearch,
  PAGE_SIZE,
  toListJobsParams,
} from '../model/search'
import { JobFilters, type SearchChange } from './job-filters'
import { JobsTable } from './jobs-table'

/** Job list with filters (kept in the URL by the caller), paging and states. */
export function JobList({
  search,
  onSearchChange,
}: {
  search: JobsSearch
  onSearchChange: SearchChange
}) {
  const { t } = useTranslation()
  const { today } = useTenantFormat()
  const params = toListJobsParams(search, today())
  const jobs = useQuery({
    queryKey: jobKeys.list(params),
    queryFn: async ({ signal }) => {
      return listJobs(params, signal)
    },
    staleTime: JOB_LIST_STALE_TIME,
    // Keep the rows on screen while the next filter or page loads
    placeholderData: keepPreviousData,
  })
  const filtered = hasActiveFilters(search)

  return (
    <div className="space-y-6">
      <JobFilters search={search} onSearchChange={onSearchChange} />

      {jobs.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : jobs.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('job.list.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void jobs.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : jobs.data.items.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {filtered || search.page > 1 ? t('job.list.emptyFiltered') : t('job.list.empty')}
          </p>
          {filtered && (
            <Button
              variant="outline"
              onClick={() => {
                onSearchChange(CLEAR_FILTERS)
              }}
            >
              {t('job.list.clearFilters')}
            </Button>
          )}
        </div>
      ) : (
        <div aria-busy={jobs.isPlaceholderData} className="space-y-4">
          <JobsTable jobs={jobs.data.items} />
          <Pagination
            page={jobs.data.page}
            totalCount={jobs.data.totalCount}
            onPage={(page) => {
              onSearchChange({ page })
            }}
          />
        </div>
      )}
    </div>
  )
}

function Pagination({
  page,
  totalCount,
  onPage,
}: {
  page: number
  totalCount: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, totalCount)
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <nav
      aria-label={t('job.list.pagination')}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground" data-testid="jobs-range">
        {t('job.list.range', { from, to, total: totalCount })}
      </p>
      {lastPage > 1 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              onPage(page - 1)
            }}
          >
            {t('job.list.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => {
              onPage(page + 1)
            }}
          >
            {t('job.list.next')}
          </Button>
        </div>
      )}
    </nav>
  )
}
