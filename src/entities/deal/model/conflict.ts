import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

/**
 * A 409 from a deal write (stale `version`, the deal was already converted…): tell the
 * user and refetch what shows sales data. The code is not branched on here: a feature
 * that needs to tell the cases apart reads `ProblemDetails.code` from the error.
 */
export async function handleDealConflict(queryClient: QueryClient): Promise<void> {
  toast.warning(i18n.t('sales.deal.conflict'))
  await invalidateRoots(queryClient, SALES_DATA_ROOTS)
}
