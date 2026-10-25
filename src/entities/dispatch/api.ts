import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { isConflict } from '@/shared/api/api-error'
import type {
  DispatchBoard,
  OptimizeRoutesBody,
  RoutePlan,
  UpdateRoutePlanBody,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import { i18n } from '@/shared/i18n'

import { BOARD_STALE_TIME, ROUTE_PLAN_STALE_TIME } from './const'

/** Keys start with `dispatch`, which job data invalidation covers. */
export const dispatchKeys = {
  all: ['dispatch'] as const,
  board: (date: string) => ['dispatch', 'board', date] as const,
  plan: (id: string) => ['dispatch', 'plan', id] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** A day: a column per active technician with their jobs, and the unassigned queue. */
export async function getDispatchBoard(date: string, signal?: AbortSignal) {
  return apiFetch<DispatchBoard>('/dispatch/board', { query: { date }, signal })
}

export async function getRoutePlan(id: string, signal?: AbortSignal) {
  return apiFetch<RoutePlan>(path`/route-plans/${id}`, { signal })
}

// --- POST / PUT (used as mutationFn) -----------------------------------------

/** Runs the solver (synchronous, up to ~10 s) and stores the result as a draft. */
export async function optimizeRoutePlan(body: OptimizeRoutesBody, idempotencyKey?: string) {
  return apiFetch<RoutePlan>('/route-plans/optimize', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Manual corrections to a draft: the routes with their jobs in visit order. */
export async function updateRoutePlan(
  id: string,
  body: UpdateRoutePlanBody,
  idempotencyKey?: string,
) {
  return apiFetch<RoutePlan>(path`/route-plans/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Applies the plan: assignments, start times, jobs become `scheduled`. */
export async function publishRoutePlan(id: string, idempotencyKey?: string) {
  return apiFetch<RoutePlan>(path`/route-plans/${id}/publish`, {
    method: 'POST',
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** A day's board; `enabled: false` until the date is valid. */
export function useGetDispatchBoard(date: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dispatchKeys.board(date),
    queryFn: ({ signal }) => getDispatchBoard(date, signal),
    staleTime: BOARD_STALE_TIME,
    enabled,
  })
}

/** A route plan (a draft, or a published or discarded one). */
export function useGetRoutePlan(id: string) {
  return useQuery({
    queryKey: dispatchKeys.plan(id),
    queryFn: ({ signal }) => getRoutePlan(id, signal),
    staleTime: ROUTE_PLAN_STALE_TIME,
  })
}

/** The plan changed under the user (it is no longer a draft, or was replaced). */
function handlePlanConflict(queryClient: Parameters<typeof invalidateRoots>[0]) {
  toast.warning(i18n.t('schedule.plan.conflict'))
  return invalidateRoots(queryClient, JOB_DATA_ROOTS)
}

/**
 * Builds a draft for a day. The plan goes into the cache and the board refetches (it
 * reports the day's draft). 402 (the plan lacks optimisation) and 502 (the solver
 * failed) are left to the caller to word.
 */
export function useOptimizeRoutePlan() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: OptimizeRoutesBody) => optimizeRoutePlan(body, idempotency.keyFor(body)),
    onSuccess: (plan, body, _result, { client }) => {
      idempotency.forget(body)
      client.setQueryData(dispatchKeys.plan(plan.id), plan)
      void invalidateRoots(client, ['dispatch'])
    },
  })
}

/** Corrections to a draft: the returned plan (with new times) replaces the cached one. */
export function useUpdateRoutePlan() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ id, routes }: { id: string; routes: UpdateRoutePlanBody['routes'] }) =>
      updateRoutePlan(id, { routes }, idempotency.keyFor({ id, routes })),
    onSuccess: (plan, variables, _result, { client }) => {
      idempotency.forget({ id: variables.id, routes: variables.routes })
      client.setQueryData(dispatchKeys.plan(plan.id), plan)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error) ? handlePlanConflict(client) : undefined,
  })
}

/** Publishing schedules jobs: the plan, the board and all job data refresh. */
export function usePublishRoutePlan() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (id: string) => publishRoutePlan(id, idempotency.keyFor({ id })),
    onSuccess: (plan, id, _result, { client }) => {
      idempotency.forget({ id })
      client.setQueryData(dispatchKeys.plan(plan.id), plan)
      void invalidateRoots(client, JOB_DATA_ROOTS)
    },
    onError: (error, _id, _result, { client }) =>
      isConflict(error) ? handlePlanConflict(client) : undefined,
  })
}
