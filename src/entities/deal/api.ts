import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { isConflict } from '@/shared/api/api-error'
import type {
  Deal,
  DealActivity,
  DealConvertRequest,
  DealConvertResult,
  DealCreate,
  DealMoveRequest,
  DealNoteInput,
  DealSummaryPage,
  DealUpdate,
  FollowUpAction,
  GetSalesBoardParams,
  GetSalesTodayParams,
  ListDealsParams,
  SalesBoard,
  SalesToday,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS, SALES_DATA_ROOTS } from '@/shared/api/query-roots'

import {
  DEAL_DETAIL_STALE_TIME,
  DEAL_LIST_STALE_TIME,
  SALES_BOARD_STALE_TIME,
  SALES_TODAY_STALE_TIME,
} from './const'
import { handleDealConflict } from './model/conflict'

export const dealKeys = {
  all: ['deals'] as const,
  board: (params: GetSalesBoardParams) => ['deals', 'board', params] as const,
  list: (params: ListDealsParams) => ['deals', 'list', params] as const,
  detail: (id: string) => ['deals', 'detail', id] as const,
  activities: (id: string) => ['deals', 'detail', id, 'activities'] as const,
  today: (params: GetSalesTodayParams) => ['deals', 'today', params] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** Open stages in order, then won and lost (the last 30 days). */
export async function getSalesBoard(params: GetSalesBoardParams, signal?: AbortSignal) {
  return apiFetch<SalesBoard>('/sales/board', { query: params, signal })
}

export async function listDeals(params: ListDealsParams, signal?: AbortSignal) {
  return apiFetch<DealSummaryPage>('/sales/deals', { query: params, signal })
}

/** The deal with its conversations (the ones the caller can see). */
export async function getDeal(id: string, signal?: AbortSignal) {
  return apiFetch<Deal>(path`/sales/deals/${id}`, { signal })
}

/** The timeline, newest first. */
export async function listDealActivities(id: string, signal?: AbortSignal) {
  return apiFetch<DealActivity[]>(path`/sales/deals/${id}/activities`, { signal })
}

/**
 * The daily list: follow-ups due, unanswered inquiries, stale deals. Without `ownerUserId`:
 * the caller's deals plus unowned conversations of shared mailboxes (owners: everyone's).
 */
export async function getSalesToday(params: GetSalesTodayParams, signal?: AbortSignal) {
  return apiFetch<SalesToday>('/sales/today', { query: params, signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createDeal(body: DealCreate, idempotencyKey?: string) {
  return apiFetch<Deal>('/sales/deals', { method: 'POST', json: body, idempotencyKey })
}

/** Full replacement with the deal's `version` (409 when stale). The stage changes through `moveDeal`. */
export async function updateDeal(id: string, body: DealUpdate, idempotencyKey?: string) {
  return apiFetch<Deal>(path`/sales/deals/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** Its conversations are unlinked, not deleted. */
export async function deleteDeal(id: string) {
  return apiFetch<undefined>(path`/sales/deals/${id}`, { method: 'DELETE' })
}

/** Changes the stage. A lost stage needs `lostReason`: 400 `sales.lost_reason_required`. */
export async function moveDeal(id: string, body: DealMoveRequest, idempotencyKey?: string) {
  return apiFetch<Deal>(path`/sales/deals/${id}/move`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** A client, a location and a job in status new, in one go. 409 `sales.deal_already_converted`. */
export async function convertDeal(id: string, body: DealConvertRequest, idempotencyKey?: string) {
  return apiFetch<DealConvertResult>(path`/sales/deals/${id}/convert`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

export async function addDealNote(id: string, body: DealNoteInput, idempotencyKey?: string) {
  return apiFetch<DealActivity>(path`/sales/deals/${id}/notes`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Marks the follow-up done, snoozes it, sets or clears it. */
export async function updateDealFollowUp(
  id: string,
  body: FollowUpAction,
  idempotencyKey?: string,
) {
  return apiFetch<Deal>(path`/sales/deals/${id}/follow-up`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useGetSalesBoard(params: GetSalesBoardParams = {}) {
  return useQuery({
    queryKey: dealKeys.board(params),
    queryFn: ({ signal }) => getSalesBoard(params, signal),
    staleTime: SALES_BOARD_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useListDeals(params: ListDealsParams = {}) {
  return useQuery({
    queryKey: dealKeys.list(params),
    queryFn: ({ signal }) => listDeals(params, signal),
    staleTime: DEAL_LIST_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useGetDeal(id: string) {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn: ({ signal }) => getDeal(id, signal),
    staleTime: DEAL_DETAIL_STALE_TIME,
  })
}

export function useListDealActivities(id: string) {
  return useQuery({
    queryKey: dealKeys.activities(id),
    queryFn: ({ signal }) => listDealActivities(id, signal),
    staleTime: DEAL_DETAIL_STALE_TIME,
  })
}

export function useGetSalesToday(params: GetSalesTodayParams = {}) {
  return useQuery({
    queryKey: dealKeys.today(params),
    queryFn: ({ signal }) => getSalesToday(params, signal),
    staleTime: SALES_TODAY_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

/** A new deal appears on the board, in the lists and in Today. */
export function useCreateDeal() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: DealCreate) => createDeal(body, idempotency.keyFor(body)),
    onSuccess: (deal, body, _result, { client }) => {
      idempotency.forget(body)
      client.setQueryData(dealKeys.detail(deal.id), deal)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

/** The saved deal goes into the cache. A 409 (stale version) refetches and tells the user. */
export function useUpdateDeal() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DealUpdate }) =>
      updateDeal(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (deal, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(dealKeys.detail(deal.id), deal)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
    onError: (error, _request, _result, { client }) =>
      isConflict(error) ? handleDealConflict(client) : undefined,
  })
}

export function useDeleteDeal() {
  return useMutation({
    mutationFn: (id: string) => deleteDeal(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, SALES_DATA_ROOTS),
  })
}

/**
 * Moves a deal to another stage; the returned deal goes into the cache. A 409 refetches
 * and tells the user. 400 `sales.lost_reason_required` is left to the caller (it shows
 * the reason field).
 */
export function useMoveDeal() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DealMoveRequest }) =>
      moveDeal(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (deal, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(dealKeys.detail(deal.id), deal)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
    onError: (error, _request, _result, { client }) =>
      isConflict(error) ? handleDealConflict(client) : undefined,
  })
}

/** Creates a client, a location and a job: everything showing job data refreshes too. */
export function useConvertDeal() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DealConvertRequest }) =>
      convertDeal(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (result, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(dealKeys.detail(result.deal.id), result.deal)
      void invalidateRoots(client, [...SALES_DATA_ROOTS, ...JOB_DATA_ROOTS])
    },
    onError: (error, _request, _result, { client }) =>
      isConflict(error) ? handleDealConflict(client) : undefined,
  })
}

export function useAddDealNote() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: DealNoteInput }) =>
      addDealNote(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_note, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, ['deals'])
    },
  })
}

export function useUpdateDealFollowUp() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: FollowUpAction }) =>
      updateDealFollowUp(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (deal, request, _result, { client }) => {
      idempotency.forget(request)
      client.setQueryData(dealKeys.detail(deal.id), deal)
      void invalidateRoots(client, ['deals', 'mail-threads'])
    },
  })
}
