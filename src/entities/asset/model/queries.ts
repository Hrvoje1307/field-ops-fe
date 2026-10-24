import { queryOptions } from '@tanstack/react-query'

import {
  getAsset,
  getGetAssetQueryKey,
  getListAssetTypesQueryKey,
  getListLocationAssetsQueryKey,
  listAssetTypes,
  listLocationAssets,
} from '@/shared/api/generated/assets/assets'

/** Tenant configuration changes rarely. */
const FIVE_MINUTES = 5 * 60_000

/** Query options for equipment; keys come from the generated client so its hooks share the cache. */
export const assetQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: getGetAssetQueryKey(id),
      queryFn: ({ signal }) => getAsset(id, { signal }),
    }),
  byLocation: (locationId: string) =>
    queryOptions({
      queryKey: getListLocationAssetsQueryKey(locationId),
      queryFn: ({ signal }) => listLocationAssets(locationId, { signal }),
    }),
}

export const assetTypeQueries = {
  list: () =>
    queryOptions({
      queryKey: getListAssetTypesQueryKey(),
      queryFn: ({ signal }) => listAssetTypes({ signal }),
      staleTime: FIVE_MINUTES,
    }),
}
