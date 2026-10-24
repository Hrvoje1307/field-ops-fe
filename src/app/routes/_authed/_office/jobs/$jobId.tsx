import { createFileRoute } from '@tanstack/react-router'

import { JobDetailPage, JobNotFound, loadJob } from '@/pages/job-detail'

export const Route = createFileRoute('/_authed/_office/jobs/$jobId')({
  loader: ({ context, params }) => loadJob(context.queryClient, params.jobId),
  notFoundComponent: JobNotFound,
  component: JobDetailRoute,
})

function JobDetailRoute() {
  const { jobId } = Route.useParams()
  return <JobDetailPage jobId={jobId} />
}
