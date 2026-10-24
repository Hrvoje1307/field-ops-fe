import { apiFetch, path } from '@/shared/api/api-fetch'
import type { Location, LocationInput } from '@/shared/api/generated/model'

export const locationKeys = {
  all: ['locations'] as const,
  detail: (id: string) => ['locations', 'detail', id] as const,
  byClient: (clientId: string) => ['locations', 'by-client', clientId] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function getLocation(id: string, signal?: AbortSignal) {
  return apiFetch<Location>(path`/locations/${id}`, { signal })
}

export async function listClientLocations(clientId: string, signal?: AbortSignal) {
  return apiFetch<Location[]>(path`/clients/${clientId}/locations`, { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createLocation(
  clientId: string,
  body: LocationInput,
  idempotencyKey?: string,
) {
  return apiFetch<Location>(path`/clients/${clientId}/locations`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}
