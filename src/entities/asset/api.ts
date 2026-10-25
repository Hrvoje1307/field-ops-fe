import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import type { Asset, AssetInput, AssetType, AssetTypeInput } from '@/shared/api/generated/model'

import { ASSET_TYPES_STALE_TIME } from './const'

export const assetKeys = {
  all: ['assets'] as const,
  detail: (id: string) => ['assets', 'detail', id] as const,
  byLocation: (locationId: string) => ['assets', 'by-location', locationId] as const,
}

export const assetTypeKeys = {
  all: ['asset-types'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function getAsset(id: string, signal?: AbortSignal) {
  return apiFetch<Asset>(path`/assets/${id}`, { signal })
}

export async function listLocationAssets(locationId: string, signal?: AbortSignal) {
  return apiFetch<Asset[]>(path`/locations/${locationId}/assets`, { signal })
}

export async function listAssetTypes(signal?: AbortSignal) {
  return apiFetch<AssetType[]>('/asset-types', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createAsset(locationId: string, body: AssetInput, idempotencyKey?: string) {
  return apiFetch<Asset>(path`/locations/${locationId}/assets`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Full replacement; the custom fields are those of `assetTypeId`. */
export async function updateAsset(id: string, body: AssetInput, idempotencyKey?: string) {
  return apiFetch<Asset>(path`/assets/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

export async function deleteAsset(id: string) {
  return apiFetch<undefined>(path`/assets/${id}`, { method: 'DELETE' })
}

export async function createAssetType(body: AssetTypeInput, idempotencyKey?: string) {
  return apiFetch<AssetType>('/asset-types', { method: 'POST', json: body, idempotencyKey })
}

/** Full replacement: an `icon` left out is cleared. */
export async function updateAssetType(id: string, body: AssetTypeInput, idempotencyKey?: string) {
  return apiFetch<AssetType>(path`/asset-types/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** 409 while equipment of that type exists; its custom fields go with it. */
export async function deleteAssetType(id: string) {
  return apiFetch<undefined>(path`/asset-types/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's equipment types. */
export function useListAssetTypes() {
  return useQuery({
    queryKey: assetTypeKeys.all,
    queryFn: ({ signal }) => listAssetTypes(signal),
    staleTime: ASSET_TYPES_STALE_TIME,
  })
}

// Client pages and job pages show equipment: both refresh after a change.

/** Adds equipment to a location. */
export function useCreateAsset() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ locationId, body }: { locationId: string; body: AssetInput }) =>
      createAsset(locationId, body, idempotency.keyFor({ locationId, body })),
    onSuccess: (_asset, variables, _result, { client }) => {
      idempotency.forget({ locationId: variables.locationId, body: variables.body })
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}

/** Saves equipment (full replacement; the custom fields are those of its type). */
export function useUpdateAsset() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssetInput }) =>
      updateAsset(id, body, idempotency.keyFor({ id, body })),
    onSuccess: (_asset, variables, _result, { client }) => {
      idempotency.forget({ id: variables.id, body: variables.body })
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}

/** Deletes equipment. */
export function useDeleteAsset() {
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: (_nothing, _id, _result, { client }) => {
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}

/** The type's name is shown on equipment, and its custom fields hang on it. */
const ASSET_TYPE_ROOTS = [...JOB_DATA_ROOTS, 'assets', 'asset-types', 'custom-fields']

export function useCreateAssetType() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: AssetTypeInput) => createAssetType(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, ASSET_TYPE_ROOTS)
    },
  })
}

export function useUpdateAssetType() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: AssetTypeInput }) =>
      updateAssetType(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, ASSET_TYPE_ROOTS)
    },
  })
}

export function useDeleteAssetType() {
  return useMutation({
    mutationFn: (id: string) => deleteAssetType(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, ASSET_TYPE_ROOTS),
  })
}
