import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClockIcon, CalendarPlusIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { FormProvider, useController, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useGetDispatchBoard } from '@/entities/dispatch'
import { type AssignRequest, type Job, useAssignJob, useGetJob } from '@/entities/job'
import { useListJobTypes } from '@/entities/job-type'
import { type Technician, TechnicianChip, useListTechnicians } from '@/entities/technician'
import { ApiError, isConflict } from '@/shared/api/api-error'
import { applyServerFieldErrors } from '@/shared/lib/form-errors'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { FieldError, FieldLegend, FieldSet } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

import {
  type AssignFormValues,
  assignFormValues,
  buildAssignSchema,
  toAssignRequest,
} from '../model/assign-form'
import { canSchedule } from '../model/schedulable'
import { type ScheduleWarning, scheduleWarnings } from '../model/warnings'

const ACTIVE = { includeInactive: false }

/**
 * "Zakaži" / "Promijeni termin": date, start and technicians in a side panel, with
 * warnings that don't block (skills, days off, hours, crew size, overlaps).
 */
export function ScheduleJobButton({
  jobId,
  number,
  scheduled,
  day,
  size = 'sm',
}: {
  jobId: string
  /** For the button's accessible name. */
  number: string
  /** Whether the job already has a schedule (button text). */
  scheduled: boolean
  /** The day being looked at (default date for an unscheduled job). */
  day?: string
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const Icon = scheduled ? CalendarClockIcon : CalendarPlusIcon
  return (
    <>
      <Button
        variant="outline"
        size={size}
        aria-label={
          scheduled
            ? t('schedule.assign.rescheduleJob', { number })
            : t('schedule.assign.scheduleJob', { number })
        }
        onClick={() => {
          setOpen(true)
        }}
      >
        <Icon aria-hidden="true" />
        {scheduled ? t('schedule.assign.reschedule') : t('schedule.assign.schedule')}
      </Button>
      {open && (
        <ScheduleSheet
          jobId={jobId}
          day={day}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

/** The schedule button for a job page: only for jobs a schedule makes sense for. */
export function JobScheduleAction({ jobId }: { jobId: string }) {
  const job = useGetJob(jobId)
  if (!job.data || !canSchedule(job.data.status)) return null
  return (
    <ScheduleJobButton
      jobId={jobId}
      number={job.data.number}
      scheduled={job.data.technicians.length > 0 || job.data.scheduledDate !== null}
    />
  )
}

function ScheduleSheet({
  jobId,
  day,
  onClose,
}: {
  jobId: string
  day: string | undefined
  onClose: () => void
}) {
  const { t } = useTranslation()
  const job = useGetJob(jobId)
  const technicians = useListTechnicians(ACTIVE)
  const jobTypes = useListJobTypes()

  if (!job.data || !technicians.data || !jobTypes.data) {
    const failed = job.isError || technicians.isError || jobTypes.isError
    return (
      <FormSheet
        open
        onOpenChange={onClose}
        title={t('schedule.assign.title')}
        onSubmit={(event) => {
          event.preventDefault()
        }}
        footer={null}
      >
        {failed ? (
          <Alert variant="destructive">
            <AlertDescription>{t('schedule.board.loadFailed')}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64" />
        )}
      </FormSheet>
    )
  }
  const requiredSkillIds =
    jobTypes.data.find((type) => type.id === job.data.jobType.id)?.requiredSkillIds ?? []
  return (
    <ScheduleForm
      job={job.data}
      technicians={technicians.data.filter((technician) => technician.isActive)}
      requiredSkillIds={requiredSkillIds}
      day={day}
      onClose={onClose}
    />
  )
}

function ScheduleForm({
  job,
  technicians,
  requiredSkillIds,
  day,
  onClose,
}: {
  job: Job
  technicians: Technician[]
  requiredSkillIds: string[]
  day: string | undefined
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { timeZone, today } = useTenantFormat()
  const [conflicted, setConflicted] = useState(false)
  const schema = useMemo(() => buildAssignSchema(), [])
  const form = useForm<AssignFormValues>({
    resolver: zodResolver(schema),
    defaultValues: assignFormValues(job, { day, today: today(), timeZone }),
  })
  const save = useAssignJob()

  const send = async (
    body: AssignRequest,
    done: 'schedule.assign.saved' | 'schedule.assign.unscheduled',
  ) => {
    try {
      const updated = await save.mutateAsync({ id: job.id, body })
      toast.success(t(done, { number: updated.number }))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        // The hook has refetched the job and told the user
        setConflicted(true)
        return
      }
      if (error instanceof ApiError && error.status === 400) {
        // The API's date and start are this form's date and time
        const fieldErrors = Object.fromEntries(
          Object.entries(error.fieldErrors).map(([path, messages]) => [
            path === 'scheduledDate' ? 'date' : path === 'scheduledStart' ? 'time' : path,
            messages,
          ]),
        )
        const unmatched = applyServerFieldErrors(form.setError, fieldErrors, form.getValues())
        if (unmatched.length > 0) toast.error(unmatched.join(' '))
        return
      }
      toast.error(t('schedule.assign.failed'))
    }
  }

  // `job` is the live query data: after a 409 it is the refetched job (new version)
  const submit = form.handleSubmit((values) =>
    send(toAssignRequest(values, { timeZone, version: job.version }), 'schedule.assign.saved'),
  )
  const unschedule = () =>
    send({ technicianIds: [], version: job.version }, 'schedule.assign.unscheduled')
  const hasSchedule = job.technicians.length > 0 || job.scheduledDate !== null

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('schedule.assign.title')}
        description={`${job.number} · ${job.title}`}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            {hasSchedule && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                disabled={save.isPending}
                onClick={() => void unschedule()}
              >
                {t('schedule.assign.unschedule')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('schedule.assign.saving') : t('schedule.assign.save')}
            </Button>
          </>
        }
      >
        {conflicted && (
          <Alert role="alert">
            <AlertDescription>{t('schedule.assign.changed')}</AlertDescription>
          </Alert>
        )}
        <FieldRow>
          <TextField name="date" label={t('schedule.assign.date')} type="date" required />
          <TextField
            name="time"
            label={t('schedule.assign.time')}
            type="time"
            hint={t('schedule.assign.timeHint')}
          />
        </FieldRow>
        <TechnicianPicker job={job} technicians={technicians} requiredSkillIds={requiredSkillIds} />
      </FormSheet>
    </FormProvider>
  )
}

function TechnicianPicker({
  job,
  technicians,
  requiredSkillIds,
}: {
  job: Job
  technicians: Technician[]
  requiredSkillIds: string[]
}) {
  const { t } = useTranslation()
  const { timeZone, formatTime } = useTenantFormat()
  const id = useId()
  const date = useWatch<AssignFormValues, 'date'>({ name: 'date' })
  const time = useWatch<AssignFormValues, 'time'>({ name: 'time' })
  const {
    field: { value: selectedIds, onChange: setSelected },
    fieldState,
  } = useController<AssignFormValues, 'technicianIds'>({ name: 'technicianIds' })
  const {
    field: { value: leadId, onChange: setLead },
  } = useController<AssignFormValues, 'leadId'>({ name: 'leadId' })
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const board = useGetDispatchBoard(date, { enabled: validDate })
  const columns = board.data?.columns ?? []
  const selected = technicians.filter((technician) => selectedIds.includes(technician.id))
  const warnings = validDate
    ? scheduleWarnings({
        job,
        requiredSkillIds,
        technicians: selected,
        allTechnicians: technicians,
        date,
        time,
        columns,
        timeZone,
      })
    : []

  const toggle = (technicianId: string, on: boolean) => {
    const next = on
      ? [...selectedIds, technicianId]
      : selectedIds.filter((other) => other !== technicianId)
    setSelected(next)
    if (!next.includes(leadId)) setLead(next[0] ?? '')
  }

  return (
    <div className="space-y-4">
      <FieldSet>
        <FieldLegend variant="label">{t('schedule.assign.technicians')}</FieldLegend>
        <ul className="space-y-2">
          {technicians.map((technician) => {
            const checked = selectedIds.includes(technician.id)
            const others = (
              columns.find((column) => column.technician.id === technician.id)?.jobs ?? []
            ).filter((other) => other.id !== job.id)
            return (
              <li
                key={technician.id}
                className="space-y-2 rounded-lg border p-3"
                data-testid="technician-option"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked}
                      onChange={(event) => {
                        toggle(technician.id, event.target.checked)
                      }}
                      aria-label={technician.fullName}
                    />
                    <TechnicianChip technician={technician} />
                  </label>
                  {checked && selectedIds.length > 1 && (
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        className="accent-primary"
                        name={`${id}-lead`}
                        checked={leadId === technician.id}
                        onChange={() => {
                          setLead(technician.id)
                        }}
                        aria-label={t('schedule.assign.makeLead', { name: technician.fullName })}
                      />
                      {t('schedule.assign.lead')}
                    </label>
                  )}
                </div>
                {checked && validDate && (
                  <div className="text-xs text-muted-foreground">
                    {others.length === 0 ? (
                      t('schedule.assign.noJobsThatDay')
                    ) : (
                      <>
                        <p>{t('schedule.assign.dayOfTechnician')}</p>
                        <ul>
                          {others.map((other) => (
                            <li key={other.id}>
                              {other.scheduledStart
                                ? formatTime(other.scheduledStart)
                                : t('schedule.board.noTime')}{' '}
                              · {other.number} {other.title}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {fieldState.error?.message && <FieldError>{fieldState.error.message}</FieldError>}
      </FieldSet>
      {warnings.length > 0 && <Warnings warnings={warnings} />}
    </div>
  )
}

function Warnings({ warnings }: { warnings: ScheduleWarning[] }) {
  const { t } = useTranslation()
  const text = (warning: ScheduleWarning) => {
    switch (warning.kind) {
      case 'missingSkills':
        return t('schedule.assign.warnings.missingSkills', {
          name: warning.name,
          skills: warning.skills.join(', '),
        })
      case 'dayOff':
        return t('schedule.assign.warnings.dayOff', { name: warning.name })
      case 'outsideHours':
        return t('schedule.assign.warnings.outsideHours', warning)
      case 'crew':
        return t('schedule.assign.warnings.crew', warning)
      case 'overlap':
        return t('schedule.assign.warnings.overlap', warning)
    }
  }
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950" data-testid="schedule-warnings">
      <AlertTitle>{t('schedule.assign.warningsTitle')}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {warnings.map((warning, index) => (
            <li key={index}>{text(warning)}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
