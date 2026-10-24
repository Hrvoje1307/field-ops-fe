import { queryOptions } from '@tanstack/react-query'

import {
  getClient,
  getGetClientQueryKey,
  getListClientsQueryKey,
  getLookupClientByPhoneQueryKey,
  listClients,
  lookupClientByPhone,
} from '@/shared/api/generated/clients/clients'
import type { ListClientsParams, LookupClientByPhoneParams } from '@/shared/api/generated/model'

/** Query options for clients; keys come from the generated client so its hooks share the cache. */
export const clientQueries = {
  list: (params?: ListClientsParams) =>
    queryOptions({
      queryKey: getListClientsQueryKey(params),
      queryFn: ({ signal }) => listClients(params, { signal }),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: getGetClientQueryKey(id),
      queryFn: ({ signal }) => getClient(id, { signal }),
    }),
  /** Clients with a contact on this phone number (quick job entry). */
  lookup: (params: LookupClientByPhoneParams) =>
    queryOptions({
      queryKey: getLookupClientByPhoneQueryKey(params),
      queryFn: ({ signal }) => lookupClientByPhone(params, { signal }),
    }),
}
