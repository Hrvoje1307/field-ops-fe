import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { isConflict } from '@/shared/api/api-error'
import type {
  Draft,
  DraftCreateRequest,
  DraftUpdate,
  ListDraftsParams,
  SendDraftBody,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'

import { DRAFT_DETAIL_STALE_TIME, DRAFT_LIST_STALE_TIME, DRAFT_POLL_MS } from './const'
import { handleDraftConflict } from './model/conflict'

export const draftKeys = {
  all: ['drafts'] as const,
  list: (params: ListDraftsParams) => ['drafts', 'list', params] as const,
  detail: (id: string) => ['drafts', 'detail', id] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** Without `status`: the ones to review (generating, ready, edited). */
export async function listDrafts(params: ListDraftsParams, signal?: AbortSignal) {
  return apiFetch<Draft[]>('/sales/drafts', { query: params, signal })
}

export async function getDraft(id: string, signal?: AbortSignal) {
  return apiFetch<Draft>(path`/sales/drafts/${id}`, { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/**
 * Asks the AI for a reply or follow-up. 202 with the draft "generating"; `DraftReady` is
 * pushed when it is written. 409 `sales.ai_disabled`, `mailbox.cannot_send`,
 * `sales.mailbox_needs_reauth`; 429 `sales.ai_quota_exceeded` (Retry-After in seconds).
 */
export async function createDraft(
  threadId: string,
  body: DraftCreateRequest,
  idempotencyKey?: string,
) {
  return apiFetch<Draft>(path`/sales/threads/${threadId}/drafts`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Saves edits (the status becomes `edited`) with the draft's `version`; 409 when stale. */
export async function updateDraft(id: string, body: DraftUpdate, idempotencyKey?: string) {
  return apiFetch<Draft>(path`/sales/drafts/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Discards the draft (and the one kept in the real mailbox). */
export async function discardDraft(id: string) {
  return apiFetch<undefined>(path`/sales/drafts/${id}`, { method: 'DELETE' })
}

/** Creates or updates the draft in the real mailbox, threaded as a reply. */
export async function saveDraftToMailbox(id: string, idempotencyKey?: string) {
  return apiFetch<Draft>(path`/sales/drafts/${id}/save-to-mailbox`, {
    method: 'POST',
    idempotencyKey,
  })
}

/** Sends the mail. Only on an explicit user action: never automatic. */
export async function sendDraft(id: string, body: SendDraftBody, idempotencyKey?: string) {
  return apiFetch<Draft>(path`/sales/drafts/${id}/send`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListDrafts(params: ListDraftsParams = {}) {
  return useQuery({
    queryKey: draftKeys.list(params),
    queryFn: ({ signal }) => listDrafts(params, signal),
    staleTime: DRAFT_LIST_STALE_TIME,
  })
}

/** The draft; while it is being written it is read again every few seconds. */
export function useGetDraft(id: string) {
  return useQuery({
    queryKey: draftKeys.detail(id),
    queryFn: ({ signal }) => getDraft(id, signal),
    staleTime: DRAFT_DETAIL_STALE_TIME,
    refetchInterval: (query) => (query.state.data?.status === 'generating' ? DRAFT_POLL_MS : false),
  })
}

/** The new draft joins its conversation and the deal's timeline. */
export function useCreateDraft() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { threadId: string; body: DraftCreateRequest }) =>
      createDraft(request.threadId, request.body, idempotency.keyFor(request)),
    onSuccess: (draft, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(draftKeys.detail(draft.id), draft)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

/** The saved draft goes into the cache. A 409 refetches and tells the user. */
export function useUpdateDraft() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DraftUpdate }) =>
      updateDraft(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (draft, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(draftKeys.detail(draft.id), draft)
      void invalidateRoots(client, ['drafts', 'mail-threads', 'deals'])
    },
    onError: (error, _request, _result, { client }) =>
      isConflict(error) ? handleDraftConflict(client, error) : undefined,
  })
}

export function useDiscardDraft() {
  return useMutation({
    mutationFn: (id: string) => discardDraft(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, SALES_DATA_ROOTS),
  })
}

export function useSaveDraftToMailbox() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (id: string) => saveDraftToMailbox(id, idempotency.keyFor({ id })),
    onSuccess: (draft, id, _result, { client }) => {
      idempotency.forget({ id })
      client.setQueryData(draftKeys.detail(draft.id), draft)
      void invalidateRoots(client, ['drafts', 'mail-threads'])
    },
    onError: (error, _id, _result, { client }) =>
      isConflict(error) ? handleDraftConflict(client, error) : undefined,
  })
}

/** The mail went out: the conversation, the deal's timeline and Today change. */
export function useSendDraft() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: SendDraftBody }) =>
      sendDraft(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (draft, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(draftKeys.detail(draft.id), draft)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
    onError: (error, _request, _result, { client }) =>
      isConflict(error) ? handleDraftConflict(client, error) : undefined,
  })
}
