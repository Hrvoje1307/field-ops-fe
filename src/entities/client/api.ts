import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { isConflict } from '@/shared/api/api-error'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import type {
  Client,
  ClientCreate,
  ClientSummaryPage,
  ClientUpdate,
  ListClientsParams,
  LookupClientByPhone200,
  LookupClientByPhoneParams,
} from '@/shared/api/generated/model'

import { CLIENT_STALE_TIME } from './const'
import { handleClientConflict } from './model/conflict'

export const clientKeys = {
  all: ['clients'] as const,
  list: (params: ListClientsParams) => ['clients', 'list', params] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  lookup: (params: LookupClientByPhoneParams) => ['clients', 'lookup', params] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listClients(params: ListClientsParams, signal?: AbortSignal) {
  return apiFetch<ClientSummaryPage>('/clients', { query: params, signal })
}

export async function getClient(id: string, signal?: AbortSignal) {
  return apiFetch<Client>(path`/clients/${id}`, { signal })
}

/** Clients with a contact on this phone number (quick job entry). */
export async function lookupClientByPhone(params: LookupClientByPhoneParams, signal?: AbortSignal) {
  return apiFetch<LookupClientByPhone200>('/clients/lookup', { query: params, signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** Optionally with its first location, in one transaction (quick job entry). */
export async function createClient(body: ClientCreate, idempotencyKey?: string) {
  return apiFetch<Client>('/clients', { method: 'POST', json: body, idempotencyKey })
}

/**
 * Full replacement with the client's `version` (409 when stale). Contacts are synced:
 * with `id` updated, without created, missing ones deleted.
 */
export async function updateClient(id: string, body: ClientUpdate, idempotencyKey?: string) {
  return apiFetch<Client>(path`/clients/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** Soft delete; 409 while the client has open jobs. */
export async function deleteClient(id: string) {
  return apiFetch<undefined>(path`/clients/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

interface QueryOptions {
  /** Wait (false) until what the request needs is known. */
  enabled?: boolean
}

/** A page of clients; with `keepPrevious` the rows stay while the next search loads. */
export function useListClients(
  params: ListClientsParams,
  { enabled = true, keepPrevious = false }: QueryOptions & { keepPrevious?: boolean } = {},
) {
  return useQuery({
    queryKey: clientKeys.list(params),
    queryFn: ({ signal }) => listClients(params, signal),
    staleTime: CLIENT_STALE_TIME,
    enabled,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

/** One client with contacts, locations and equipment. */
export function useGetClient(id: string, { enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: ({ signal }) => getClient(id, signal),
    staleTime: CLIENT_STALE_TIME,
    enabled,
  })
}

/** Clients with a contact on this number; nothing is asked until there is one. */
export function useLookupClientByPhone(phone: string) {
  return useQuery({
    queryKey: clientKeys.lookup({ phone }),
    queryFn: ({ signal }) => lookupClientByPhone({ phone }, signal),
    staleTime: CLIENT_STALE_TIME,
    enabled: phone !== '',
  })
}

/** Puts a client that was already fetched (e.g. by the lookup) into the detail cache. */
export function useCacheClient() {
  const queryClient = useQueryClient()
  return (client: Client) => {
    queryClient.setQueryData(clientKeys.detail(client.id), client)
  }
}

/** Creates a client (optionally with its first location); the new client is cached. */
export function useCreateClient() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: ClientCreate) => createClient(body, idempotency.keyFor(body)),
    onSuccess: (created, body, _result, { client }) => {
      idempotency.forget(body)
      client.setQueryData(clientKeys.detail(created.id), created)
      void client.invalidateQueries({ queryKey: clientKeys.all })
    },
  })
}

/**
 * Saves a client with its `version`. The saved client is cached and job data refreshes
 * (jobs show client names). A 409 (stale version) refetches and tells the user.
 */
export function useUpdateClient() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClientUpdate }) =>
      updateClient(id, body, idempotency.keyFor({ id, body })),
    onSuccess: (saved, variables, _result, { client }) => {
      idempotency.forget({ id: variables.id, body: variables.body })
      client.setQueryData(clientKeys.detail(saved.id), saved)
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error) ? handleClientConflict(client) : undefined,
  })
}

/** Deletes a client (the API refuses with 409 while it has open jobs). */
export function useDeleteClient() {
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: (_nothing, id, _result, { client }) => {
      client.removeQueries({ queryKey: clientKeys.detail(id) })
      void client.invalidateQueries({ queryKey: clientKeys.all })
    },
  })
}
