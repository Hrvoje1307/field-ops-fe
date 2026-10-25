import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type RoutePlan,
  useGetDispatchBoard,
  useGetRoutePlan,
  usePublishRoutePlan,
  useUpdateRoutePlan,
} from '@/entities/dispatch'
import type { JobSummary } from '@/entities/job'
import { TechnicianChip, useListTechnicians } from '@/entities/technician'
import { ApiError, isConflict } from '@/shared/api/api-error'
import { applyMove, baseId, type DragMove, isCopy } from '@/shared/lib/drag-move'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { DragBoard, DragColumn, DragItem } from '@/shared/ui/drag-board'
import { Skeleton } from '@/shared/ui/skeleton'

import { planLayout, routesFromLayout, UNASSIGNED_ID } from '../lib/plan-layout'
import { StopBody } from './stop-body'

const WITH_INACTIVE = { includeInactive: true }

/**
 * A route plan: a column per technician with the stops in visit order (arrival,
 * departure, drive), and the jobs the plan could not place. A draft is corrected by
 * dragging jobs between the lists (each change is saved and the times come back
 * recalculated) and published when it is right.
 */
export function RoutePlanView({ planId }: { planId: string }) {
  const { t } = useTranslation()
  const plan = useGetRoutePlan(planId)

  if (plan.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      </div>
    )
  }
  if (plan.isError) {
    const missing = plan.error instanceof ApiError && plan.error.status === 404
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {missing ? t('schedule.plan.notFound') : t('schedule.plan.loadFailed')}
        </AlertDescription>
        {!missing && (
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void plan.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    )
  }
  return <LoadedPlan plan={plan.data} />
}

function LoadedPlan({ plan }: { plan: RoutePlan }) {
  const { t } = useTranslation()
  const { formatDate, formatRelativeDay, formatDistance, formatDuration, formatTime } =
    useTenantFormat()
  const board = useGetDispatchBoard(plan.date)
  const technicians = useListTechnicians(WITH_INACTIVE)
  const update = useUpdateRoutePlan()
  const [pending, setPending] = useState<DragMove | null>(null)
  const draft = plan.status === 'draft'

  const jobs = useMemo(
    () =>
      new Map<string, JobSummary>(
        [
          ...(board.data?.unassigned ?? []),
          ...(board.data?.columns.flatMap((column) => column.jobs) ?? []),
        ].map((job) => [job.id, job]),
      ),
    [board.data],
  )
  // Active technicians, and anyone the plan has a route for
  const columns = useMemo(() => {
    const routed = new Set(plan.routes.map((route) => route.technicianId))
    return (technicians.data ?? []).filter(
      (technician) => technician.isActive || routed.has(technician.id),
    )
  }, [technicians.data, plan.routes])
  const saved = useMemo(
    () =>
      planLayout(
        plan,
        columns.map((technician) => technician.id),
      ),
    [plan, columns],
  )
  // The card sits where it was dropped until the corrected plan is back; if the save
  // fails, the plan is what the server has
  const layout = pending && update.isPending ? applyMove(saved, pending) : saved

  const unplaced = useMemo(
    () => new Map(plan.unassigned.map((item) => [item.jobId, item])),
    [plan.unassigned],
  )
  const stopOf = (technicianId: string, jobId: string) =>
    plan.routes
      .find((route) => route.technicianId === technicianId)
      ?.stops.find((s) => s.jobId === jobId)

  const nameOf = useCallback(
    (itemId: string) => {
      const job = jobs.get(baseId(itemId))
      return job ? t('schedule.board.jobName', { number: job.number, title: job.title }) : itemId
    },
    [jobs, t],
  )
  const listNameOf = useCallback(
    (id: string) =>
      id === UNASSIGNED_ID
        ? t('schedule.plan.unassigned')
        : (technicians.data?.find((technician) => technician.id === id)?.fullName ?? id),
    [technicians.data, t],
  )

  function onMove(move: DragMove) {
    if (!draft || update.isPending || isCopy(move.itemId)) return
    if (move.fromId === UNASSIGNED_ID && move.toId === UNASSIGNED_ID) return
    setPending(move)
    update.mutate(
      { id: plan.id, routes: routesFromLayout(applyMove(saved, move)) },
      {
        onError: (error) => {
          if (!isConflict(error)) toast.error(t('schedule.plan.saveFailed'))
        },
      },
    )
  }

  const item = (itemId: string, listId: string) => {
    const jobId = baseId(itemId)
    const job = jobs.get(jobId)
    const movable = draft && !isCopy(itemId) && !job?.locked
    return (
      <DragItem
        key={itemId}
        id={itemId}
        listId={listId}
        disabled={!movable}
        handleLabel={t('schedule.plan.dragStop', { number: job?.number ?? jobId })}
        testId="plan-stop"
        className="rounded-lg border bg-background p-2.5 text-sm"
      >
        {(handle) => (
          <StopBody
            jobId={jobId}
            job={job}
            handle={handle}
            times={listId === UNASSIGNED_ID ? undefined : stopOf(listId, jobId)}
            unplaced={listId === UNASSIGNED_ID ? unplaced.get(jobId) : undefined}
          />
        )}
      </DragItem>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/"
            search={{ date: plan.date }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            {t('schedule.plan.back')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {t('schedule.plan.forDay', {
              day: `${formatRelativeDay(plan.date)}, ${formatDate(plan.date, { day: 'numeric', month: 'long', year: 'numeric' })}`,
            })}
            <Badge variant={draft ? 'secondary' : 'outline'} data-testid="plan-status">
              {t(`schedule.plan.status.${plan.status}`)}
            </Badge>
          </h1>
          {plan.totalDistanceM != null && plan.totalDurationS != null && (
            <p className="text-sm text-muted-foreground">
              {t('schedule.plan.totals', {
                distance: formatDistance(plan.totalDistanceM),
                duration: formatDuration(Math.round(plan.totalDurationS / 60)),
              })}
            </p>
          )}
        </div>
        {draft && <PublishPlanButton planId={plan.id} busy={update.isPending} />}
      </header>

      {draft ? (
        <p className="text-sm text-muted-foreground">
          {update.isPending ? t('schedule.plan.saving') : t('schedule.plan.dragHint')}
        </p>
      ) : (
        <Alert>
          <AlertDescription>{t('schedule.plan.readOnly')}</AlertDescription>
        </Alert>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        <DragBoard
          layout={layout}
          nameOf={nameOf}
          listNameOf={listNameOf}
          onMove={onMove}
          renderOverlay={(itemId) => (
            <div className="rounded-lg border bg-background p-2.5 text-sm shadow-lg">
              <StopBody jobId={baseId(itemId)} job={jobs.get(baseId(itemId))} linked={false} />
            </div>
          )}
        >
          <div className="flex min-w-max items-start gap-4" aria-busy={update.isPending}>
            {columns.map((technician) => {
              const route = plan.routes.find((r) => r.technicianId === technician.id)
              const itemIds = layout[technician.id] ?? []
              return (
                <DragColumn
                  key={technician.id}
                  id={technician.id}
                  testId="plan-route"
                  label={technician.fullName}
                  title={<TechnicianChip technician={technician} />}
                  itemIds={itemIds}
                  empty={t('schedule.plan.noStops')}
                  subtitle={
                    <span className="block space-y-0.5">
                      <span className="block">
                        {t('schedule.plan.stops', { count: itemIds.length })}
                      </span>
                      {route?.startTime && route.endTime && (
                        <span className="block">
                          {t('schedule.plan.routeHours', {
                            start: formatTime(route.startTime),
                            end: formatTime(route.endTime),
                          })}
                          {route.distanceM != null && route.durationS != null
                            ? ` · ${t('schedule.plan.routeTotals', {
                                distance: formatDistance(route.distanceM),
                                duration: formatDuration(Math.round(route.durationS / 60)),
                              })}`
                            : null}
                        </span>
                      )}
                    </span>
                  }
                >
                  {itemIds.map((itemId) => item(itemId, technician.id))}
                </DragColumn>
              )
            })}
            <DragColumn
              id={UNASSIGNED_ID}
              testId="plan-unassigned"
              title={t('schedule.plan.unassigned')}
              itemIds={layout[UNASSIGNED_ID] ?? []}
              empty={t('schedule.plan.unassignedEmpty')}
              subtitle={String(layout[UNASSIGNED_ID]?.length ?? 0)}
              className="bg-muted/40"
            >
              {(layout[UNASSIGNED_ID] ?? []).map((itemId) => item(itemId, UNASSIGNED_ID))}
            </DragColumn>
          </div>
        </DragBoard>
      </div>
    </div>
  )
}

function PublishPlanButton({ planId, busy }: { planId: string; busy: boolean }) {
  const { t } = useTranslation()
  const publish = usePublishRoutePlan()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        disabled={busy}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {t('schedule.plan.publish')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!publish.isPending) setOpen(next)
        }}
        title={t('schedule.plan.publishTitle')}
        description={t('schedule.plan.publishDescription')}
        confirmLabel={t('schedule.plan.publishConfirm')}
        confirmVariant="default"
        pending={publish.isPending}
        error={error}
        onConfirm={() => {
          publish.mutate(planId, {
            onSuccess: () => {
              setOpen(false)
              toast.success(t('schedule.plan.published'))
            },
            onError: (failure) => {
              if (isConflict(failure)) setOpen(false)
              else setError(t('schedule.plan.publishFailed'))
            },
          })
        }}
      />
    </>
  )
}
