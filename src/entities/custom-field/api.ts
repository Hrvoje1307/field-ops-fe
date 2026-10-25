import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  CustomFieldDefinition,
  CustomFieldDefinitionInput,
  CustomFieldEntity,
  ListCustomFieldsParams,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

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
  /** Every definition of an entity, for every asset type (the settings list). */
  ofEntity: (entity: CustomFieldEntity) => ['custom-fields', 'entity', entity] as const,
}

/** Forms and detail pages show definitions and their values; so do equipment pages. */
const CUSTOM_FIELD_ROOTS = [...JOB_DATA_ROOTS, 'custom-fields', 'assets']

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

/**
 * All definitions of an entity as stored, in display order. For equipment that is every
 * asset type's fields, a key possibly twice (unlike the form's, one per key).
 */
export async function listEntityCustomFields(entity: CustomFieldEntity, signal?: AbortSignal) {
  const definitions = await apiFetch<CustomFieldDefinition[]>('/custom-fields', {
    query: { entity },
    signal,
  })
  return [...definitions].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  )
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** 409 when the key exists for that entity (and asset type). */
export async function createCustomField(body: CustomFieldDefinitionInput, idempotencyKey?: string) {
  return apiFetch<CustomFieldDefinition>('/custom-fields', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** `key`, `entity` and `type` cannot change (422): stored values depend on them. */
export async function updateCustomField(
  id: string,
  body: CustomFieldDefinitionInput,
  idempotencyKey?: string,
) {
  return apiFetch<CustomFieldDefinition>(path`/custom-fields/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** The values stay stored but are no longer shown. */
export async function deleteCustomField(id: string) {
  return apiFetch<undefined>(path`/custom-fields/${id}`, { method: 'DELETE' })
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

/** Every definition of an entity (the settings list). */
export function useListEntityCustomFields(entity: CustomFieldEntity) {
  return useQuery({
    queryKey: customFieldKeys.ofEntity(entity),
    queryFn: ({ signal }) => listEntityCustomFields(entity, signal),
    staleTime: CUSTOM_FIELDS_STALE_TIME,
  })
}

export function useCreateCustomField() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: CustomFieldDefinitionInput) =>
      createCustomField(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, CUSTOM_FIELD_ROOTS)
    },
  })
}

export function useUpdateCustomField() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: CustomFieldDefinitionInput }) =>
      updateCustomField(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, CUSTOM_FIELD_ROOTS)
    },
  })
}

export function useDeleteCustomField() {
  return useMutation({
    mutationFn: (id: string) => deleteCustomField(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, CUSTOM_FIELD_ROOTS),
  })
}
