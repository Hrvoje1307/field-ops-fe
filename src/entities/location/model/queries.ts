import { queryOptions } from '@tanstack/react-query'

import {
  getGetLocationQueryKey,
  getListClientLocationsQueryKey,
  getLocation,
  listClientLocations,
} from '@/shared/api/generated/locations/locations'

/** Query options for locations; keys come from the generated client so its hooks share the cache. */
export const locationQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: getGetLocationQueryKey(id),
      queryFn: ({ signal }) => getLocation(id, { signal }),
    }),
  byClient: (clientId: string) =>
    queryOptions({
      queryKey: getListClientLocationsQueryKey(clientId),
      queryFn: ({ signal }) => listClientLocations(clientId, { signal }),
    }),
}
