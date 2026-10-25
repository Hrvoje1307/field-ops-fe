import { cn } from 'cn'
import { type ReactNode, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type DispatchBoard,
  type DispatchBoardColumnsItem,
  useGetDispatchBoard,
} from '@/entities/dispatch'
import { isConflict } from '@/shared/api/api-error'
import { type JobSummary, useAssignJob } from '@/entities/job'
import { useListJobTypes } from '@/entities/job-type'
import {
  scheduleWarnings,
  TechnicianChip,
  useListTechnicians,
  warningText,
} from '@/entities/technician'
import { baseId, type DragMove, withCopies } from '@/shared/lib/drag-move'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { DragBoard, DragColumn, DragItem } from '@/shared/ui/drag-board'
import { Skeleton } from '@/shared/ui/skeleton'

import { dropRequest, isDraggable, lockRequest, QUEUE_ID, startsOutOfOrder } from '../lib/drop'
import { minutesBetween } from '../lib/minutes'
import { usePendingMove } from '../model/pending-move'
import { JobCardBody } from './job-card'

const ACTIVE = { includeInactive: false }

/**
 * One day: the unassigned queue and a column per technician (working hours, load,
 * jobs in visit order). Cards move between the lists by drag and drop (pointer or
 * keyboard) and save at once; what else a card can do comes from the caller
 * (`jobActions`).
 */
export function DayBoard({
  date,
  jobActions,
}: {
  /** Tenant-local `yyyy-MM-dd`. */
  date: string
  jobActions?: (job: JobSummary) => ReactNode
}) {
  const { t } = useTranslation()
  const board = useGetDispatchBoard(date)

  if (board.isPending) {
    return (
      <div aria-busy="true" className="flex gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    )
  }
  if (board.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('schedule.board.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void board.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return (
    <LoadedBoard
      date={date}
      board={board.data}
      boardStamp={board.dataUpdatedAt}
      jobActions={jobActions}
    />
  )
}

function LoadedBoard({
  date,
  board,
  boardStamp,
  jobActions,
}: {
  date: string
  board: DispatchBoard
  /** When this board was fetched; a newer one replaces a card shown where it was dropped. */
  boardStamp: number
  jobActions?: (job: JobSummary) => ReactNode
}) {
  const { t } = useTranslation()
  const { timeZone } = useTenantFormat()
  const assign = useAssignJob()
  const technicians = useListTechnicians(ACTIVE)
  const jobTypes = useListJobTypes()
  const pending = usePendingMove(boardStamp)

  const jobs = useMemo(
    () =>
      new Map(
        [...board.unassigned, ...board.columns.flatMap((column) => column.jobs)].map((job) => [
          job.id,
          job,
        ]),
      ),
    [board],
  )
  // A job for several technicians is on each of their columns: one id per place
  const saved = useMemo<Record<string, string[]>>(
    () =>
      withCopies({
        [QUEUE_ID]: board.unassigned.map((job) => job.id),
        ...Object.fromEntries(
          board.columns.map((column) => [column.technician.id, column.jobs.map((job) => job.id)]),
        ),
      }),
    [board],
  )
  // The card sits where it was dropped until the board is fetched again; if the save
  // fails it goes back at once
  const layout = pending.apply(saved)

  const nameOf = useCallback(
    (id: string) => {
      const job = jobs.get(baseId(id))
      return job ? t('schedule.board.jobName', { number: job.number, title: job.title }) : id
    },
    [jobs, t],
  )
  const listNameOf = useCallback(
    (id: string) =>
      id === QUEUE_ID
        ? t('schedule.board.queue')
        : (board.columns.find((column) => column.technician.id === id)?.technician.fullName ?? id),
    [board.columns, t],
  )

  function notifyWarnings(job: JobSummary, technicianId: string) {
    const technician = technicians.data?.find((candidate) => candidate.id === technicianId)
    if (!technician) return
    const requiredSkillIds =
      jobTypes.data?.find((type) => type.id === job.jobType.id)?.requiredSkillIds ?? []
    const warnings = scheduleWarnings({
      job,
      requiredSkillIds,
      technicians: [technician],
      allTechnicians: technicians.data ?? [],
      date,
      time: '',
      columns: board.columns,
      timeZone,
    })
    if (warnings.length === 0) return
    toast.warning(t('schedule.assign.warningsTitle'), {
      description: warnings.map((warning) => warningText(t, warning)).join(' '),
    })
  }

  /** A job that kept its agreed time may now stand before an earlier one or after a later one. */
  function notifyOrder(job: JobSummary, move: DragMove) {
    if (!job.scheduledStart) return
    const column = board.columns.find((candidate) => candidate.technician.id === move.toId)
    const others = (column?.jobs ?? []).filter((other) => other.id !== job.id)
    const after = [...others.slice(0, move.index), job, ...others.slice(move.index)]
    if (!startsOutOfOrder(after, job.id)) return
    toast.warning(t('schedule.board.startsOutOfOrder', { number: job.number }))
  }

  function save(job: JobSummary, move: DragMove | null, body: ReturnType<typeof dropRequest>) {
    if (!body) return
    if (move) pending.begin(move)
    assign.mutate(
      { id: job.id, body },
      {
        onSuccess: () => {
          if (!move) return
          if (move.toId === QUEUE_ID) {
            toast.success(t('schedule.assign.unscheduled', { number: job.number }))
          } else {
            if (move.fromId !== move.toId) {
              toast.success(t('schedule.assign.saved', { number: job.number }))
            }
            notifyWarnings(job, move.toId)
            notifyOrder(job, move)
          }
        },
        onError: (error) => {
          pending.clear()
          if (!isConflict(error)) toast.error(t('schedule.assign.failed'))
        },
      },
    )
  }

  function onMove(move: DragMove) {
    const job = jobs.get(baseId(move.itemId))
    if (!job || assign.isPending || !isDraggable(job)) return
    save(job, move, dropRequest(move, date, job))
  }

  function onToggleLock(job: JobSummary) {
    pending.clear()
    assign.mutate(
      { id: job.id, body: lockRequest(job) },
      {
        onError: (error) => {
          if (!isConflict(error)) toast.error(t('schedule.board.lockFailed'))
        },
      },
    )
  }

  const card = (itemId: string, job: JobSummary, list: string) => {
    const queue = list === QUEUE_ID
    return (
      <DragItem
        key={itemId}
        id={itemId}
        listId={list}
        disabled={!isDraggable(job)}
        handleLabel={t('schedule.board.dragJob', { number: job.number })}
        testId="board-job"
        className="rounded-lg border bg-background p-2.5 text-sm"
      >
        {(handle) => (
          <JobCardBody
            job={job}
            queue={queue}
            handle={handle}
            actions={jobActions?.(job)}
            onToggleLock={() => {
              onToggleLock(job)
            }}
          />
        )}
      </DragItem>
    )
  }

  const shown = (list: string) =>
    (layout[list] ?? []).flatMap((id) => {
      const job = jobs.get(baseId(id))
      return job ? [card(id, job, list)] : []
    })

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
      <DragBoard
        layout={layout}
        nameOf={nameOf}
        listNameOf={listNameOf}
        onMove={onMove}
        renderOverlay={(id) => {
          const job = jobs.get(baseId(id))
          return job ? (
            <div className="rounded-lg border bg-background p-2.5 text-sm shadow-lg">
              <JobCardBody job={job} queue={(layout[QUEUE_ID] ?? []).includes(id)} linked={false} />
            </div>
          ) : null
        }}
      >
        <div className="flex min-w-max items-start gap-4">
          <DragColumn
            id={QUEUE_ID}
            title={t('schedule.board.queue')}
            subtitle={String(layout[QUEUE_ID]?.length ?? 0)}
            testId="queue"
            className="bg-muted/40"
            itemIds={layout[QUEUE_ID] ?? []}
            empty={t('schedule.board.queueEmpty')}
          >
            {shown(QUEUE_ID)}
          </DragColumn>
          {board.columns.length === 0 && (
            <p className="self-center text-sm text-muted-foreground">
              {t('schedule.board.noTechnicians')}
            </p>
          )}
          {board.columns.map((column) => (
            <TechnicianColumn
              key={column.technician.id}
              column={column}
              itemIds={layout[column.technician.id] ?? []}
            >
              {shown(column.technician.id)}
            </TechnicianColumn>
          ))}
        </div>
      </DragBoard>
    </div>
  )
}

function TechnicianColumn({
  column,
  itemIds,
  children,
}: {
  column: DispatchBoardColumnsItem
  itemIds: readonly string[]
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { formatDuration } = useTenantFormat()
  const available = minutesBetween(column.workStart, column.workEnd)
  const planned = column.plannedMinutes ?? 0
  const share = available > 0 ? Math.min(1, planned / available) : 0

  return (
    <DragColumn
      id={column.technician.id}
      title={<TechnicianChip technician={column.technician} />}
      label={column.technician.fullName}
      testId="technician-column"
      itemIds={itemIds}
      empty={t('schedule.board.columnEmpty')}
      subtitle={
        column.isWorkingDay ? (
          <span className="space-y-1">
            <span className="block">
              {t('schedule.board.hours', { start: column.workStart, end: column.workEnd })} ·{' '}
              {t('schedule.board.load', {
                planned: formatDuration(planned),
                available: formatDuration(available),
              })}
            </span>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full',
                  planned > available ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${String(Math.round(share * 100))}%` }}
              />
            </span>
          </span>
        ) : (
          <span className="font-medium text-amber-800">{t('schedule.board.dayOff')}</span>
        )
      }
      className={column.isWorkingDay ? undefined : 'opacity-75'}
    >
      {children}
    </DragColumn>
  )
}
