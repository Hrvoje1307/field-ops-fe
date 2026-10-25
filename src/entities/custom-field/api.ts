import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { CustomFieldDefinition, ListCustomFieldsParams } from '@/shared/api/generated/model'

import { CUSTOM_FIELDS_STALE_TIME } from './const'
import { prepareDefinitions } from './lib/definitions'
import type { CustomFieldScope } from './model/types'

function paramsOf(scope: CustomFieldScope): ListCustomFieldsParams {
  // Without an asset type the API returns every type's fields, possibly the same key twice
  return scope.entity === 'asset'
    ? { entity: 'asset', assetTypeId: scope.assetTypeId }
    : { entity: scope.entity }
}

export const customFieldKeys = {
  all: ['custom-fields'] as const,
  list: (scope: CustomFieldScope) => ['custom-fields', paramsOf(scope)] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** The tenant's field definitions for an entity (and asset type), in display order. */
export async function listCustomFieldDefinitions(
  scope: CustomFieldScope,
  signal?: AbortSignal,
): Promise<CustomFieldDefinition[]> {
  const definitions = await apiFetch<CustomFieldDefinition[]>('/custom-fields', {
    query: paramsOf(scope),
    signal,
  })
  return prepareDefinitions(definitions)
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's field definitions for an entity (and asset type), in display order. */
export function useListCustomFieldDefinitions(
  scope: CustomFieldScope,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: customFieldKeys.list(scope),
    queryFn: ({ signal }) => listCustomFieldDefinitions(scope, signal),
    staleTime: CUSTOM_FIELDS_STALE_TIME,
    enabled,
  })
}
