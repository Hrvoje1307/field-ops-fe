import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  Client,
  ClientCreate,
  ClientSummaryPage,
  ClientUpdate,
  ListClientsParams,
  LookupClientByPhone200,
  LookupClientByPhoneParams,
} from '@/shared/api/generated/model'

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
