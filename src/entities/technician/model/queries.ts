import { queryOptions } from '@tanstack/react-query'

import type {
  GetTechnicianScheduleParams,
  ListTechniciansParams,
} from '@/shared/api/generated/model'
import {
  getGetTechnicianQueryKey,
  getGetTechnicianScheduleQueryKey,
  getListTechniciansQueryKey,
  getTechnician,
  getTechnicianSchedule,
  listTechnicians,
} from '@/shared/api/generated/technicians/technicians'

/** Query options for technicians; keys come from the generated client so its hooks share the cache. */
export const technicianQueries = {
  list: (params?: ListTechniciansParams) =>
    queryOptions({
      queryKey: getListTechniciansQueryKey(params),
      queryFn: ({ signal }) => listTechnicians(params, { signal }),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: getGetTechnicianQueryKey(id),
      queryFn: ({ signal }) => getTechnician(id, { signal }),
    }),
  /** One technician's jobs on a day. */
  schedule: (id: string, params: GetTechnicianScheduleParams) =>
    queryOptions({
      queryKey: getGetTechnicianScheduleQueryKey(id, params),
      queryFn: ({ signal }) => getTechnicianSchedule(id, params, { signal }),
    }),
}
