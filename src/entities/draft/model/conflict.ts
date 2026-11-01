import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'

/**
 * A 409 from a draft write (stale `version`, already sent): tell the user once and show the
 * draft as it is now. The text is the error map's for the code the API sent, the general
 * "changed meanwhile" line when it sent none; features add no toast of their own for a 409.
 */
export async function handleDraftConflict(queryClient: QueryClient, error: unknown): Promise<void> {
  toast.warning(salesErrorCode(error) ? salesErrorMessage(error) : i18n.t('sales.draft.conflict'))
  await invalidateRoots(queryClient, SALES_DATA_ROOTS)
}
