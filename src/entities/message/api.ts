import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  ListMessagesParams,
  Message,
  MessagePage,
  NotifyClientBody,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots } from '@/shared/api/query-roots'

import { MESSAGE_POLL_MS, MESSAGES_STALE_TIME } from './const'
import { isOnItsWay } from './lib/status'

export const messageKeys = {
  all: ['messages'] as const,
  list: (params: ListMessagesParams) => ['messages', 'list', params] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** What the tenant has sent, newest first. */
export async function listMessages(params: ListMessagesParams, signal?: AbortSignal) {
  return apiFetch<MessagePage>('/messages', { query: params, signal })
}

// --- POST (used as mutationFn) -----------------------------------------------

/**
 * Sends the client a message by SMS or e-mail, from a template or as free text. 202 with
 * the messages made (one per contact); 422 when there is nobody to send to, or SMS is off.
 */
export async function notifyClient(jobId: string, body: NotifyClientBody, idempotencyKey?: string) {
  return apiFetch<Message[]>(path`/jobs/${jobId}/notify`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

/**
 * The messages, newest first. While any is still on its way the list is read again every
 * few seconds, because the API has no event for a message arriving.
 */
export function useListMessages(params: ListMessagesParams) {
  return useQuery({
    queryKey: messageKeys.list(params),
    queryFn: ({ signal }) => listMessages(params, signal),
    staleTime: MESSAGES_STALE_TIME,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((message) => isOnItsWay(message)) ? MESSAGE_POLL_MS : false,
  })
}

/** Sends a message to the client of a job; the lists and the month's usage are read again. */
export function useNotifyClient() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { jobId: string; body: NotifyClientBody }) =>
      notifyClient(request.jobId, request.body, idempotency.keyFor(request)),
    onSuccess: (_messages, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, ['messages', 'tenant'])
    },
  })
}
