import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  GetTechnicianScheduleParams,
  ListTechniciansParams,
  Technician,
  TechnicianDay,
} from '@/shared/api/generated/model'

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
