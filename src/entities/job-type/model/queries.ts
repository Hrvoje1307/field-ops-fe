import { queryOptions } from '@tanstack/react-query'

import {
  getListJobTypesQueryKey,
  listJobTypes,
} from '@/shared/api/generated/configuration/configuration'

/** Tenant configuration changes rarely. */
const FIVE_MINUTES = 5 * 60_000

export const jobTypeQueries = {
  list: () =>
    queryOptions({
      queryKey: getListJobTypesQueryKey(),
      queryFn: ({ signal }) => listJobTypes({ signal }),
      staleTime: FIVE_MINUTES,
    }),
}
