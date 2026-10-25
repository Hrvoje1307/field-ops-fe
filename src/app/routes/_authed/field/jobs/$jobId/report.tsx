import { createFileRoute } from '@tanstack/react-router'

import { FieldReportPage } from '@/pages/field-report'

export const Route = createFileRoute('/_authed/field/jobs/$jobId/report')({
  component: FieldReportRoute,
})

function FieldReportRoute() {
  const { jobId } = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <FieldReportPage
      jobId={jobId}
      onCompleted={() => {
        void navigate({ to: '/field' })
      }}
    />
  )
}
