import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  Attachment,
  ClassificationUpdate,
  ExclusionRule,
  ListMailThreadsParams,
  MailThread,
  MailThreadSummary,
  MailThreadSummaryPage,
  SaveAttachmentRequest,
  ThreadExcludeRequest,
  ThreadLinkRequest,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'

import {
  MAIL_THREAD_DETAIL_STALE_TIME,
  MAIL_THREAD_POLL_MS,
  MAIL_THREADS_STALE_TIME,
} from './const'

export const mailThreadKeys = {
  all: ['mail-threads'] as const,
  list: (params: ListMailThreadsParams) => ['mail-threads', 'list', params] as const,
  detail: (id: string) => ['mail-threads', 'detail', id] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/**
 * The inbox. Cards are parameters: Prodaja `isSales=true`, Za pregled `needsReview=true`,
 * Čeka odgovor `awaitingReply=true`, "nije povezano" `unlinked=true`. Non-sales threads are
 * returned only with `isSales=false`.
 */
export async function listMailThreads(params: ListMailThreadsParams, signal?: AbortSignal) {
  return apiFetch<MailThreadSummaryPage>('/sales/threads', { query: params, signal })
}

/** The thread with the messages the caller can see (oldest first) and its drafts. */
export async function getMailThread(id: string, signal?: AbortSignal) {
  return apiFetch<MailThread>(path`/sales/threads/${id}`, { signal })
}

// --- POST / PUT (used as mutationFn) -----------------------------------------

/** Corrects the AI's category; kept as an example for later classification in this tenant. */
export async function updateThreadClassification(
  id: string,
  body: ClassificationUpdate,
  idempotencyKey?: string,
) {
  return apiFetch<MailThreadSummary>(path`/sales/threads/${id}/classification`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Runs the classification again (202). 409 `sales.ai_disabled`, 429 `sales.ai_quota_exceeded`. */
export async function reprocessMailThread(id: string) {
  return apiFetch<undefined>(path`/sales/threads/${id}/reprocess`, { method: 'POST' })
}

/** Exactly one of `dealId` or `createDeal`, or `dealId: null` to unlink. */
export async function linkMailThread(id: string, body: ThreadLinkRequest, idempotencyKey?: string) {
  return apiFetch<MailThreadSummary>(path`/sales/threads/${id}/link`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Never process this sender or domain again; `purge` (default) deletes stored bodies and the classification. */
export async function excludeMailThread(
  id: string,
  body: ThreadExcludeRequest,
  idempotencyKey?: string,
) {
  return apiFetch<ExclusionRule>(path`/sales/threads/${id}/exclude`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Saves a mail attachment to the linked deal; 409 `thread.not_linked` when there is none. */
export async function saveThreadAttachment(
  id: string,
  body: SaveAttachmentRequest,
  idempotencyKey?: string,
) {
  return apiFetch<Attachment>(path`/sales/threads/${id}/attachments`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListMailThreads(params: ListMailThreadsParams) {
  return useQuery({
    queryKey: mailThreadKeys.list(params),
    queryFn: ({ signal }) => listMailThreads(params, signal),
    staleTime: MAIL_THREADS_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useGetMailThread(id: string) {
  return useQuery({
    queryKey: mailThreadKeys.detail(id),
    queryFn: ({ signal }) => getMailThread(id, signal),
    staleTime: MAIL_THREAD_DETAIL_STALE_TIME,
    // Until the live event arrives (S9) a thread the AI is working on is read again
    refetchInterval: (query) =>
      query.state.data?.aiStatus === 'pending' ? MAIL_THREAD_POLL_MS : false,
  })
}

/** A correction changes the inbox cards, Today's review count and a deal's conversations. */
export function useUpdateThreadClassification() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: ClassificationUpdate }) =>
      updateThreadClassification(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_thread, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

/** Queues the AI; the thread is "pending" until `SalesThreadUpdated` arrives. */
export function useReprocessMailThread() {
  return useMutation({
    mutationFn: (id: string) => reprocessMailThread(id),
    onSuccess: (_nothing, _id, _result, { client }) =>
      invalidateRoots(client, ['mail-threads', 'deals']),
  })
}

/** Linking, creating a deal from a thread and unlinking change both the thread and the deals. */
export function useLinkMailThread() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: ThreadLinkRequest }) =>
      linkMailThread(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_thread, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

/** The rule joins the settings and the conversations of that sender leave the inbox. */
export function useExcludeMailThread() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: ThreadExcludeRequest }) =>
      excludeMailThread(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_rule, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

/** The file belongs to the deal now: the thread (saved mark), the deal and its file list refresh. */
export function useSaveThreadAttachment() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: SaveAttachmentRequest }) =>
      saveThreadAttachment(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_attachment, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, [...SALES_DATA_ROOTS, 'reports'])
    },
  })
}
