import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  Client,
  ClientSummaryPage,
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
