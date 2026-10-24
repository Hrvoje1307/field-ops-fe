import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { JobCreatePage } from '@/pages/job-create'

const searchSchema = z.object({
  /** Start with this client chosen (e.g. "Novi nalog" on a client's page). */
  clientId: z.string().min(1).max(64).optional().catch(undefined),
})

export const Route = createFileRoute('/_authed/_office/jobs/new')({
  validateSearch: searchSchema,
  component: JobCreateRoute,
})

function JobCreateRoute() {
  const { clientId } = Route.useSearch()
  return <JobCreatePage clientId={clientId} />
}
