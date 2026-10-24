import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { jobTypeQueries } from '@/entities/job-type'
import { technicianQueries } from '@/entities/technician'
import { Priority } from '@/shared/api/generated/model'
import { Button } from '@/shared/ui/button'
import { Field, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'

import {
  CLEAR_FILTERS,
  DATE_FILTERS,
  hasActiveFilters,
  JOB_STATUSES,
  type JobsSearch,
  SORT_NAMES,
  STATUS_PRESET_NAMES,
} from '../model/search'

export type SearchChange = (patch: Partial<JobsSearch>, options?: { replace?: boolean }) => void

const SEARCH_DELAY_MS = 300
const PRIORITIES = [Priority.urgent, Priority.high, Priority.normal, Priority.low]

/** Filters and sort of the job list; every change goes to the URL and back to page 1. */
export function JobFilters({
  search,
  onSearchChange,
}: {
  search: JobsSearch
  onSearchChange: SearchChange
}) {
  const { t } = useTranslation()
  const ids = useId()
  const jobTypes = useQuery(jobTypeQueries.list())
  const technicians = useQuery(technicianQueries.list({ includeInactive: true }))
  const filter = (patch: Partial<JobsSearch>) => {
    onSearchChange({ ...patch, page: 1 })
  }

  return (
    <div className="space-y-3">
      <SearchBox
        value={search.q ?? ''}
        onCommit={(q) => {
          onSearchChange({ q: q || undefined, page: 1 }, { replace: true })
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field>
          <FieldLabel htmlFor={`${ids}-status`}>{t('job.list.status')}</FieldLabel>
          <NativeSelect
            id={`${ids}-status`}
            className="w-full"
            value={search.status}
            onChange={(event) => {
              filter({ status: event.target.value as JobsSearch['status'] })
            }}
          >
            {STATUS_PRESET_NAMES.map((preset) => (
              <NativeSelectOption key={preset} value={preset}>
                {t(`job.list.statusPreset.${preset}`)}
              </NativeSelectOption>
            ))}
            {JOB_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {t(`job.status.${status}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-date`}>{t('job.list.date')}</FieldLabel>
          <NativeSelect
            id={`${ids}-date`}
            className="w-full"
            value={search.date}
            onChange={(event) => {
              filter({ date: event.target.value as JobsSearch['date'] })
            }}
          >
            {DATE_FILTERS.map((date) => (
              <NativeSelectOption key={date} value={date}>
                {t(`job.list.datePreset.${date}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-type`}>{t('job.list.jobType')}</FieldLabel>
          <NativeSelect
            id={`${ids}-type`}
            className="w-full"
            value={search.jobTypeId ?? ''}
            onChange={(event) => {
              filter({ jobTypeId: event.target.value || undefined })
            }}
          >
            <NativeSelectOption value="">{t('job.list.allJobTypes')}</NativeSelectOption>
            {jobTypes.data
              ?.toSorted((a, b) => a.name.localeCompare(b.name))
              .map((jobType) => (
                <NativeSelectOption key={jobType.id} value={jobType.id}>
                  {jobType.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-technician`}>{t('job.list.technician')}</FieldLabel>
          <NativeSelect
            id={`${ids}-technician`}
            className="w-full"
            value={search.technicianId ?? ''}
            onChange={(event) => {
              filter({ technicianId: event.target.value || undefined })
            }}
          >
            <NativeSelectOption value="">{t('job.list.allTechnicians')}</NativeSelectOption>
            {technicians.data
              ?.toSorted((a, b) => a.fullName.localeCompare(b.fullName))
              .map((technician) => (
                <NativeSelectOption key={technician.id} value={technician.id}>
                  {technician.fullName}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-priority`}>{t('job.list.priority')}</FieldLabel>
          <NativeSelect
            id={`${ids}-priority`}
            className="w-full"
            value={search.priority ?? ''}
            onChange={(event) => {
              filter({ priority: (event.target.value || undefined) as JobsSearch['priority'] })
            }}
          >
            <NativeSelectOption value="">{t('job.list.allPriorities')}</NativeSelectOption>
            {PRIORITIES.map((priority) => (
              <NativeSelectOption key={priority} value={priority}>
                {t(`job.priority.${priority}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${ids}-sort`}>{t('job.list.sort')}</FieldLabel>
          <NativeSelect
            id={`${ids}-sort`}
            className="w-full"
            value={search.sort}
            onChange={(event) => {
              filter({ sort: event.target.value as JobsSearch['sort'] })
            }}
          >
            {SORT_NAMES.map((sort) => (
              <NativeSelectOption key={sort} value={sort}>
                {t(`job.list.sortOption.${sort}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {hasActiveFilters(search) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange(CLEAR_FILTERS)
          }}
        >
          {t('job.list.clearFilters')}
        </Button>
      )}
    </div>
  )
}

/** Search text, sent to the URL after a short pause in typing. */
function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)

  // Follow outside changes (clear filters, back button)
  if (value !== shown) {
    setShown(value)
    if (text.trim() !== value) setText(value)
  }

  const commit = useEffectEvent(onCommit)
  useEffect(() => {
    const q = text.trim()
    if (q === value) return
    const timer = setTimeout(() => {
      commit(q)
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text, value])

  return (
    <Field className="max-w-md">
      <FieldLabel htmlFor={id}>{t('job.list.search')}</FieldLabel>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          className="pl-8"
          placeholder={t('job.list.searchPlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
      </div>
    </Field>
  )
}
