import { createFileRoute } from '@tanstack/react-router'

import { JobDetailPage } from '@/pages/job-detail'

export const Route = createFileRoute('/_authed/_office/jobs/$jobId')({
  component: JobDetailRoute,
})

function JobDetailRoute() {
  const { jobId } = Route.useParams()
  return <JobDetailPage jobId={jobId} />
}
