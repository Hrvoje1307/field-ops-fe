import { createFileRoute } from '@tanstack/react-router'

import { JobsListPage } from '@/pages/jobs-list'

export const Route = createFileRoute('/_authed/_office/jobs')({
  component: JobsListPage,
})
