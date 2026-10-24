import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { JOBS_SEARCH_DEFAULTS, type JobsSearchChange, jobsSearchSchema } from '@/features/job/list'
import { JobsListPage } from '@/pages/jobs-list'

export const Route = createFileRoute('/_authed/_office/jobs/')({
  validateSearch: jobsSearchSchema,
  search: { middlewares: [stripSearchParams(JOBS_SEARCH_DEFAULTS)] },
  component: JobsListRoute,
})

function JobsListRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange: JobsSearchChange = (patch, options) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: options?.replace })
  }
  return <JobsListPage search={search} onSearchChange={onSearchChange} />
}
