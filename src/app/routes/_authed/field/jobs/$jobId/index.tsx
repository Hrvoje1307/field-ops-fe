import { createFileRoute } from '@tanstack/react-router'

import { FieldJobPage } from '@/pages/field-job'

export const Route = createFileRoute('/_authed/field/jobs/$jobId/')({
  component: FieldJobRoute,
})

function FieldJobRoute() {
  const { jobId } = Route.useParams()
  return <FieldJobPage jobId={jobId} />
}
