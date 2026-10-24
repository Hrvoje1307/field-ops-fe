import { apiFetch, path } from '@/shared/api/api-fetch'
import type { Asset, AssetInput, AssetType } from '@/shared/api/generated/model'

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
