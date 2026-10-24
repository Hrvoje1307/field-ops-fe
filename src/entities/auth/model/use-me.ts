import { useSuspenseQuery } from '@tanstack/react-query'

import type { Me } from '@/shared/api/generated/model'

import { authKeys, getMe } from '../api'
import { ME_STALE_TIME } from '../const'

/**
 * The signed-in user. Session data, read anywhere in the signed-in area: the route
 * guard has already loaded `/me` (`fetchMe`) before any screen renders.
 */
export function useMe(): Me {
  return useSuspenseQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => getMe(signal),
    staleTime: ME_STALE_TIME,
  }).data
}
