import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { invalidateRoots } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

/**
 * 409 on a client write (stale `version`): tell the user and refetch client data.
 * Resolves once active queries have refetched.
 */
export async function handleClientConflict(queryClient: QueryClient): Promise<void> {
  toast.warning(i18n.t('client.conflict'))
  await invalidateRoots(queryClient, ['clients'])
}
