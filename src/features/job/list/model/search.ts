import { z } from 'zod'

import {
  JobStatus,
  type ListJobsParams,
  ListJobsSort,
  Priority,
} from '@/shared/api/generated/model'
import { addDays } from '@/shared/lib/datetime'

export const PAGE_SIZE = 50

/**
 * Status filter: a preset or one status. Presets group the platform-wide statuses for
 * the list only; the API filters by the statuses they stand for.
 */
const STATUS_PRESETS = {
  open: ['new', 'scheduled', 'confirmed', 'en_route', 'on_site', 'on_hold'],
  done: ['completed', 'invoiced'],
  all: undefined,
} as const satisfies Record<string, readonly JobStatus[] | undefined>

export type StatusPreset = keyof typeof STATUS_PRESETS
export const STATUS_PRESET_NAMES = Object.keys(STATUS_PRESETS) as StatusPreset[]
export const JOB_STATUSES = Object.values(JobStatus)
export type StatusFilter = StatusPreset | JobStatus
const STATUS_FILTERS: StatusFilter[] = [...STATUS_PRESET_NAMES, ...JOB_STATUSES]

/** Scheduled-date filter, relative to today in the tenant's time zone. */
export const DATE_FILTERS = ['any', 'today', 'tomorrow', 'next7', 'unscheduled'] as const
export type DateFilter = (typeof DATE_FILTERS)[number]

export const SORTS = {
  newest: ListJobsSort['-createdAt'],
  schedule: ListJobsSort.scheduledStart,
  priority: ListJobsSort['-priority'],
  number: ListJobsSort['-number'],
} as const
export type SortName = keyof typeof SORTS
export const SORT_NAMES = Object.keys(SORTS) as SortName[]

const id = z.string().min(1).max(64)

/** The list's URL search params. Invalid values fall back instead of failing the page. */
export const jobsSearchSchema = z.object({
  status: z.enum(STATUS_FILTERS).default('open').catch('open'),
  q: z.string().max(200).optional().catch(undefined),
  jobTypeId: id.optional().catch(undefined),
  technicianId: id.optional().catch(undefined),
  priority: z.enum(Object.values(Priority)).optional().catch(undefined),
  date: z.enum(DATE_FILTERS).default('any').catch('any'),
  sort: z.enum(SORT_NAMES).default('newest').catch('newest'),
  page: z.number().int().min(1).default(1).catch(1),
})

export type JobsSearch = z.infer<typeof jobsSearchSchema>

/** Left out of the URL when they have these values. */
export const JOBS_SEARCH_DEFAULTS = {
  status: 'open',
  date: 'any',
  sort: 'newest',
  page: 1,
} as const satisfies Partial<JobsSearch>

/** Search change that resets every filter; the sort stays. */
export const CLEAR_FILTERS: Partial<JobsSearch> = {
  status: undefined,
  date: undefined,
  q: undefined,
  jobTypeId: undefined,
  technicianId: undefined,
  priority: undefined,
  page: 1,
}

/** Whether any filter (not sort or page) differs from the defaults. */
export function hasActiveFilters(search: JobsSearch): boolean {
  return (
    search.status !== JOBS_SEARCH_DEFAULTS.status ||
    search.date !== JOBS_SEARCH_DEFAULTS.date ||
    Boolean(search.q?.trim()) ||
    search.jobTypeId !== undefined ||
    search.technicianId !== undefined ||
    search.priority !== undefined
  )
}

function isPreset(status: StatusFilter): status is StatusPreset {
  return status in STATUS_PRESETS
}

function dateRange(date: DateFilter, today: string): Partial<ListJobsParams> {
  switch (date) {
    case 'any':
      return {}
    case 'today':
      return { from: today, to: today }
    case 'tomorrow':
      return { from: addDays(today, 1), to: addDays(today, 1) }
    case 'next7':
      return { from: today, to: addDays(today, 6) }
    case 'unscheduled':
      return { unscheduled: true }
  }
}

/** `GET /jobs` params for the search; `today` is the tenant's date. */
export function toListJobsParams(search: JobsSearch, today: string): ListJobsParams {
  const status = isPreset(search.status) ? STATUS_PRESETS[search.status] : [search.status]
  const q = search.q?.trim()
  return {
    ...(status ? { status: [...status] } : {}),
    ...(q ? { q } : {}),
    ...(search.jobTypeId ? { jobTypeId: search.jobTypeId } : {}),
    ...(search.technicianId ? { technicianId: search.technicianId } : {}),
    ...(search.priority ? { priority: search.priority } : {}),
    ...dateRange(search.date, today),
    sort: SORTS[search.sort],
    page: search.page,
    pageSize: PAGE_SIZE,
  }
}
