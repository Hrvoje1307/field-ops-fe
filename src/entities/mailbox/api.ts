import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  DeleteMailboxParams,
  ImapMailboxCreate,
  Mailbox,
  MailboxOAuthStartRequest,
  MailboxOAuthStartResponse,
  MailboxUpdate,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'
import { useHubLive } from '@/shared/api/realtime/live-status'

import { MAILBOX_POLL_MS, MAILBOXES_STALE_TIME } from './const'

export const mailboxKeys = {
  all: ['mailboxes'] as const,
  list: ['mailboxes', 'list'] as const,
}

/** What a mailbox's status or sync shows: its own list and Today (mailboxes needing attention). */
const MAILBOX_ROOTS = ['mailboxes', 'deals']

// --- GET (used as queryFn) ---------------------------------------------------

/** The mailboxes the caller may see: shared ones, their own personal one; owners see all. */
export async function listMailboxes(signal?: AbortSignal) {
  return apiFetch<Mailbox[]>('/sales/mailboxes', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/**
 * Owner only. The browser goes to `authorizeUrl` (the provider's consent page); the
 * provider returns it to `/sales/settings/mailboxes?connected={id}` or `?error={code}`.
 */
export async function startMailboxOAuth(body: MailboxOAuthStartRequest, idempotencyKey?: string) {
  return apiFetch<MailboxOAuthStartResponse>('/sales/mailboxes/oauth/start', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/**
 * Owner only. The server tests IMAP and SMTP first: 422 `mailbox.imap_failed` or
 * `mailbox.smtp_failed` (the server's message in `detail`), 409 `sales.mailbox_exists`.
 */
export async function createImapMailbox(body: ImapMailboxCreate, idempotencyKey?: string) {
  return apiFetch<Mailbox>('/sales/mailboxes/imap', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Owner only: rename, change kind or owner, pause (`isActive: false`) or resume. */
export async function updateMailbox(id: string, body: MailboxUpdate, idempotencyKey?: string) {
  return apiFetch<Mailbox>(path`/sales/mailboxes/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. Disconnects (deals stay); `purge` also deletes the imported threads, messages and drafts. */
export async function deleteMailbox(id: string, params: DeleteMailboxParams = {}) {
  return apiFetch<undefined>(path`/sales/mailboxes/${id}`, { method: 'DELETE', query: params })
}

/** Asks for an immediate sync (202). 409 `sales.mailbox_needs_reauth` when it has to be connected again. */
export async function syncMailbox(id: string) {
  return apiFetch<undefined>(path`/sales/mailboxes/${id}/sync`, { method: 'POST' })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListMailboxes(options: { enabled?: boolean } = {}) {
  const hubLive = useHubLive()
  return useQuery({
    queryKey: mailboxKeys.list,
    queryFn: ({ signal }) => listMailboxes(signal),
    staleTime: MAILBOXES_STALE_TIME,
    enabled: options.enabled ?? true,
    // The first sync of a new mailbox takes a while. With the hub the sync's thread events
    // refresh the list; only without it is the list polled, and only while one is connecting
    refetchInterval: (query) =>
      !hubLive && query.state.data?.some((mailbox) => mailbox.status === 'connecting')
        ? MAILBOX_POLL_MS
        : false,
  })
}

/** Gives the provider's consent URL; nothing is saved until the provider returns. */
export function useStartMailboxOAuth() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: MailboxOAuthStartRequest) =>
      startMailboxOAuth(body, idempotency.keyFor(body)),
    onSettled: (_response, _error, body) => {
      idempotency.forget(body)
    },
  })
}

export function useCreateImapMailbox() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: ImapMailboxCreate) => createImapMailbox(body, idempotency.keyFor(body)),
    onSuccess: (_mailbox, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, MAILBOX_ROOTS)
    },
  })
}

export function useUpdateMailbox() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: MailboxUpdate }) =>
      updateMailbox(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_mailbox, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, MAILBOX_ROOTS)
    },
  })
}

/** Disconnects; with `purge` the conversations that only it held are gone, so all sales data refreshes. */
export function useDeleteMailbox() {
  return useMutation({
    mutationFn: (request: { id: string; purge?: boolean }) =>
      deleteMailbox(request.id, request.purge ? { purge: true } : {}),
    onSuccess: (_nothing, request, _result, { client }) =>
      invalidateRoots(client, request.purge ? SALES_DATA_ROOTS : MAILBOX_ROOTS),
  })
}

export function useSyncMailbox() {
  return useMutation({
    mutationFn: (id: string) => syncMailbox(id),
    onSettled: (_nothing, _error, _id, _result, { client }) =>
      invalidateRoots(client, MAILBOX_ROOTS),
  })
}

/** Reads the mailboxes again (after the browser came back from a provider's consent page). */
export function useRefreshMailboxes() {
  const client = useQueryClient()
  return () => invalidateRoots(client, MAILBOX_ROOTS)
}
