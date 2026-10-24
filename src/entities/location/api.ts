import { apiFetch, path } from '@/shared/api/api-fetch'
import type { Location } from '@/shared/api/generated/model'

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
