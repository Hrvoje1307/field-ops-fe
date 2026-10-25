import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  GetTechnicianScheduleParams,
  ListTechniciansParams,
  Technician,
  TechnicianCreate,
  TechnicianDay,
  TechnicianUpdate,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { TECHNICIAN_STALE_TIME } from './const'

export const technicianKeys = {
  all: ['technicians'] as const,
  list: (params: ListTechniciansParams) => ['technicians', 'list', params] as const,
  detail: (id: string) => ['technicians', 'detail', id] as const,
  /** One technician's jobs on a day (job data: invalidated when a job changes). */
  schedule: (id: string, params: GetTechnicianScheduleParams) =>
    ['technicians', 'schedule', id, params] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listTechnicians(params: ListTechniciansParams, signal?: AbortSignal) {
  return apiFetch<Technician[]>('/technicians', { query: params, signal })
}

export async function getTechnician(id: string, signal?: AbortSignal) {
  return apiFetch<Technician>(path`/technicians/${id}`, { signal })
}

export async function getTechnicianSchedule(
  id: string,
  params: GetTechnicianScheduleParams,
  signal?: AbortSignal,
) {
  return apiFetch<TechnicianDay>(path`/technicians/${id}/schedule`, { query: params, signal })
}

// --- POST / PUT (used as mutationFn) -----------------------------------------

/** The user must already be a member with the role `technician` (400 on `userId`). */
export async function createTechnician(body: TechnicianCreate, idempotencyKey?: string) {
  return apiFetch<Technician>('/technicians', { method: 'POST', json: body, idempotencyKey })
}

/** Full replacement of the working data; the person stays the same. */
export async function updateTechnician(
  id: string,
  body: TechnicianUpdate,
  idempotencyKey?: string,
) {
  return apiFetch<Technician>(path`/technicians/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's technicians. */
export function useListTechnicians(params: ListTechniciansParams) {
  return useQuery({
    queryKey: technicianKeys.list(params),
    queryFn: ({ signal }) => listTechnicians(params, signal),
    staleTime: TECHNICIAN_STALE_TIME,
  })
}

/** A technician's hours, days, depot, skills and colour show on the board, in plans and in members. */
const TECHNICIAN_ROOTS = [...JOB_DATA_ROOTS, 'members']

/** Gives a member with the role technician their working data. */
export function useCreateTechnician() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: TechnicianCreate) => createTechnician(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, TECHNICIAN_ROOTS)
    },
  })
}

export function useUpdateTechnician() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: TechnicianUpdate }) =>
      updateTechnician(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, TECHNICIAN_ROOTS)
    },
  })
}
