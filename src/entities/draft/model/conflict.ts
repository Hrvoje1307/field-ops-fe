import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

/** A 409 from a draft write (stale `version`, already sent): tell the user and show the draft as it is now. */
export async function handleDraftConflict(queryClient: QueryClient): Promise<void> {
  toast.warning(i18n.t('sales.draft.conflict'))
  await invalidateRoots(queryClient, SALES_DATA_ROOTS)
}
