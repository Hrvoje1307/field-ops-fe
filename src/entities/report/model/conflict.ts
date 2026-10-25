import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

/**
 * A 409 from a report write: the job moved on (it is no longer on site, or was
 * invoiced). Tell the user and refetch everything that shows the job.
 */
export function handleReportConflict(queryClient: QueryClient): Promise<void> {
  toast.warning(i18n.t('report.conflict'))
  return invalidateRoots(queryClient, JOB_DATA_ROOTS)
}
