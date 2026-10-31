import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  ListSalesStagesParams,
  SalesStage,
  SalesStageInput,
  StageOrder,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots } from '@/shared/api/query-roots'

import { SALES_STAGES_STALE_TIME } from './const'

export const salesStageKeys = {
  all: ['sales-stages'] as const,
  list: (params: ListSalesStagesParams) => ['sales-stages', 'list', params] as const,
}

/** A stage shows on the board, in deals and in the follow-up rules. */
const STAGE_ROOTS = ['sales-stages', 'deals', 'sales-config']

// --- GET (used as queryFn) ---------------------------------------------------

/** In board order; inactive stages only with `includeInactive`. */
export async function listSalesStages(params: ListSalesStagesParams, signal?: AbortSignal) {
  return apiFetch<SalesStage[]>('/sales/stages', { query: params, signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** Owner only. Appended before the won and lost stages. */
export async function createSalesStage(body: SalesStageInput, idempotencyKey?: string) {
  return apiFetch<SalesStage>('/sales/stages', { method: 'POST', json: body, idempotencyKey })
}

/** Owner only. All stage ids in the new order. */
export async function reorderSalesStages(body: StageOrder, idempotencyKey?: string) {
  return apiFetch<SalesStage[]>('/sales/stages/order', {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. 409 `sales.stage_required` when it would leave no (or two) active won or lost stage. */
export async function updateSalesStage(id: string, body: SalesStageInput, idempotencyKey?: string) {
  return apiFetch<SalesStage>(path`/sales/stages/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. 409 `sales.stage_in_use` while deals are in it, `sales.stage_required` for the only won or lost one. */
export async function deleteSalesStage(id: string) {
  return apiFetch<undefined>(path`/sales/stages/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListSalesStages(params: ListSalesStagesParams = {}) {
  return useQuery({
    queryKey: salesStageKeys.list(params),
    queryFn: ({ signal }) => listSalesStages(params, signal),
    staleTime: SALES_STAGES_STALE_TIME,
  })
}

export function useCreateSalesStage() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: SalesStageInput) => createSalesStage(body, idempotency.keyFor(body)),
    onSuccess: (_stage, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, STAGE_ROOTS)
    },
  })
}

export function useReorderSalesStages() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: StageOrder) => reorderSalesStages(body, idempotency.keyFor(body)),
    onSuccess: (_stages, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, STAGE_ROOTS)
    },
  })
}

export function useUpdateSalesStage() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: SalesStageInput }) =>
      updateSalesStage(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_stage, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, STAGE_ROOTS)
    },
  })
}

export function useDeleteSalesStage() {
  return useMutation({
    mutationFn: (id: string) => deleteSalesStage(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, STAGE_ROOTS),
  })
}
