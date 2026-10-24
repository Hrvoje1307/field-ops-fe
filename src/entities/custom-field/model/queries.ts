import { queryOptions, useQuery } from '@tanstack/react-query'

import {
  getListCustomFieldsQueryKey,
  listCustomFields,
} from '@/shared/api/generated/configuration/configuration'
import type { ListCustomFieldsParams } from '@/shared/api/generated/model'

import { prepareDefinitions } from '../lib/definitions'
import type { CustomFieldScope } from './types'

/** Tenant configuration changes rarely. */
const FIVE_MINUTES = 5 * 60_000

function paramsOf(scope: CustomFieldScope): ListCustomFieldsParams {
  // Without an asset type the API returns every type's fields, possibly the same key twice
  return scope.entity === 'asset'
    ? { entity: 'asset', assetTypeId: scope.assetTypeId }
    : { entity: scope.entity }
}

export const customFieldQueries = {
  /** The tenant's field definitions for an entity, in display order. */
  list: (scope: CustomFieldScope) => {
    const params = paramsOf(scope)
    return queryOptions({
      queryKey: getListCustomFieldsQueryKey(params),
      queryFn: ({ signal }) => listCustomFields(params, { signal }),
      staleTime: FIVE_MINUTES,
      select: prepareDefinitions,
    })
  },
}

export function useCustomFieldDefinitions(scope: CustomFieldScope) {
  return useQuery(customFieldQueries.list(scope))
}
