import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type { Depot, DepotInput } from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { DEPOTS_STALE_TIME } from './const'

export const depotKeys = {
  all: ['depots'] as const,
}

/** Technicians start from a depot, and routes and plans are worked out from it. */
const DEPOT_ROOTS = [...JOB_DATA_ROOTS, 'depots']

// --- GET (used as queryFn) ---------------------------------------------------

export async function listDepots(signal?: AbortSignal) {
  return apiFetch<Depot[]>('/depots', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createDepot(body: DepotInput, idempotencyKey?: string) {
  return apiFetch<Depot>('/depots', { method: 'POST', json: body, idempotencyKey })
}

/** Full replacement: coordinates left out are cleared. */
export async function updateDepot(id: string, body: DepotInput, idempotencyKey?: string) {
  return apiFetch<Depot>(path`/depots/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** 409 while technicians still start from it. */
export async function deleteDepot(id: string) {
  return apiFetch<undefined>(path`/depots/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's depots and workshops. */
export function useListDepots() {
  return useQuery({
    queryKey: depotKeys.all,
    queryFn: ({ signal }) => listDepots(signal),
    staleTime: DEPOTS_STALE_TIME,
  })
}

export function useCreateDepot() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: DepotInput) => createDepot(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, DEPOT_ROOTS)
    },
  })
}

export function useUpdateDepot() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DepotInput }) =>
      updateDepot(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, DEPOT_ROOTS)
    },
  })
}

export function useDeleteDepot() {
  return useMutation({
    mutationFn: (id: string) => deleteDepot(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, DEPOT_ROOTS),
  })
}
