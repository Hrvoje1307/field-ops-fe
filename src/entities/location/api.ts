import { useMutation } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
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

/** Full replacement. Access codes: `null` keeps them, `""` removes them, text replaces. */
export async function updateLocation(id: string, body: LocationInput, idempotencyKey?: string) {
  return apiFetch<Location>(path`/locations/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** Soft delete; 409 while the location has open jobs. */
export async function deleteLocation(id: string) {
  return apiFetch<undefined>(path`/locations/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------
// Client pages and job pages show locations: both refresh after a change.

/** Adds a location to a client. */
export function useCreateLocation() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ clientId, body }: { clientId: string; body: LocationInput }) =>
      createLocation(clientId, body, idempotency.keyFor({ clientId, body })),
    onSuccess: (_location, variables, _result, { client }) => {
      idempotency.forget({ clientId: variables.clientId, body: variables.body })
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}

/** Saves a location (access codes: `null` keeps, `""` removes, text replaces). */
export function useUpdateLocation() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LocationInput }) =>
      updateLocation(id, body, idempotency.keyFor({ id, body })),
    onSuccess: (_location, variables, _result, { client }) => {
      idempotency.forget({ id: variables.id, body: variables.body })
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}

/** Deletes a location (the API refuses with 409 while it has open jobs). */
export function useDeleteLocation() {
  return useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: (_nothing, _id, _result, { client }) => {
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
  })
}
