import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

/**
 * Any 409 from a job write (stale `version`, status changed in the meantime…): tell the
 * user and refetch everything that shows job data. Resolves once active queries have
 * refetched. Doesn't branch on `ProblemDetails.code`: the spec lists none
 * (docs/backend-questions.md #4).
 */
export async function handleJobConflict(queryClient: QueryClient): Promise<void> {
  toast.warning(i18n.t('job.conflict'))
  await invalidateRoots(queryClient, JOB_DATA_ROOTS)
}
