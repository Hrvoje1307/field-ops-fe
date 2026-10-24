import { createFileRoute } from '@tanstack/react-router'

import { JobCreatePage } from '@/pages/job-create'

export const Route = createFileRoute('/_authed/_office/jobs/new')({
  component: JobCreatePage,
})
