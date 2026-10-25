import { zodResolver } from '@hookform/resolvers/zod'
import { EllipsisIcon } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  type Job,
  type JobStatus,
  splitTransitions,
  transitionNeedsNote,
  useGetJob,
  useTransitionJob,
} from '@/entities/job'
import { ApiError, isConflict } from '@/shared/api/api-error'
import { applyFieldErrors } from '@/shared/lib/form-errors'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Spinner } from '@/shared/ui/spinner'
import { Textarea } from '@/shared/ui/textarea'

/** Arrival steps record where the technician is. */
const WITH_POSITION: readonly JobStatus[] = ['en_route', 'on_site']

/**
 * The job screen's one big action (the next step of `allowedTransitions`), and "Više"
 * for the rest (e.g. on hold, with a required reason). Reads the job itself, so after a
 * change or a 409 it shows the job as the server has it.
 */
export function FieldStatusBar({
  jobId,
  finish,
}: {
  jobId: string
  /**
   * The way to finish the job (the report screen), shown as the big action when the API
   * allows completing it: `completed` is not a plain status change, it goes through
   * `/complete` with the report.
   */
  finish?: ReactNode
}) {
  const { data: job } = useGetJob(jobId)
  return job ? <Bar job={job} finish={finish} /> : null
}

function Bar({ job, finish }: { job: Job; finish?: ReactNode }) {
  const { t } = useTranslation()
  const change = useTransitionJob()
  const [reasonFor, setReasonFor] = useState<JobStatus | null>(null)
  const { primary: next, more } = splitTransitions(job.status, job.allowedTransitions)
  const canFinish = Boolean(finish) && job.allowedTransitions.includes('completed')
  // Finishing is what the technician does on site; it takes the place of the next step
  const primary = canFinish ? null : next

  const choose = (to: JobStatus) => {
    if (transitionNeedsNote(to)) {
      setReasonFor(to)
      return
    }
    change.mutate(
      { job, to, withPosition: WITH_POSITION.includes(to) },
      {
        onSuccess: () => {
          toast.success(t('field.job.done', { status: t(`job.status.${to}`) }))
        },
        onError: (error) => {
          // A 409 is handled by the hook (refetch and message)
          if (!isConflict(error)) toast.error(t('job.changeStatus.failed'))
        },
      },
    )
  }

  if (!primary && !canFinish && more.length === 0) return null
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl gap-3">
          {canFinish && finish}
          {primary && (
            <Button
              size="lg"
              className="h-14 flex-1 text-base"
              disabled={change.isPending}
              onClick={() => {
                choose(primary)
              }}
            >
              {change.isPending ? <Spinner /> : null}
              {t(`job.transition.${primary}`)}
            </Button>
          )}
          {more.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  variant={primary || canFinish ? 'outline' : 'default'}
                  className={primary || canFinish ? 'h-14 px-4' : 'h-14 flex-1 text-base'}
                  disabled={change.isPending}
                  aria-label={t('field.job.moreActions')}
                >
                  <EllipsisIcon aria-hidden="true" />
                  {!primary && !canFinish && t('field.job.more')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                {more.map((to) => (
                  <DropdownMenuItem
                    key={to}
                    className="min-h-12 text-base"
                    onSelect={() => {
                      choose(to)
                    }}
                  >
                    {t(`job.transition.${to}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {reasonFor && (
        <ReasonDialog
          job={job}
          to={reasonFor}
          onClose={() => {
            setReasonFor(null)
          }}
        />
      )}
    </>
  )
}

/** Asks for the reason where the contract needs a note; stays open on 409 with the note kept. */
function ReasonDialog({ job, to, onClose }: { job: Job; to: JobStatus; onClose: () => void }) {
  const { t } = useTranslation()
  const change = useTransitionJob()
  const [conflicted, setConflicted] = useState(false)
  const schema = useMemo(
    () => z.object({ note: z.string().trim().min(1, t('field.job.reasonRequired')) }),
    [t],
  )
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { note: '' } })

  const submit = handleSubmit(async ({ note }) => {
    setConflicted(false)
    try {
      await change.mutateAsync({ job, to, note, withPosition: WITH_POSITION.includes(to) })
      toast.success(t('field.job.done', { status: t(`job.status.${to}`) }))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        // The hook has refetched the job and told the user
        setConflicted(true)
      } else if (error instanceof ApiError && error.status === 400) {
        const unmatched = applyFieldErrors(setError, error.fieldErrors, ['note'])
        if (unmatched.length > 0) toast.error(unmatched.join(' '))
      } else {
        toast.error(t('job.changeStatus.failed'))
      }
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form noValidate className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('field.job.reasonTitle')}</DialogTitle>
            <DialogDescription>
              {t('field.job.reasonDescription', { number: job.number })}
            </DialogDescription>
          </DialogHeader>
          {conflicted && (
            <Alert role="alert">
              <AlertDescription>{t('job.transitionDialog.changed')}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={errors.note ? true : undefined}>
            <FieldLabel htmlFor="field-reason">{t('field.job.reason')}</FieldLabel>
            <Textarea
              id="field-reason"
              rows={4}
              autoFocus
              aria-invalid={errors.note ? true : undefined}
              {...register('note')}
            />
            <FieldError errors={[errors.note]} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="lg">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t('job.changeStatus.saving') : t(`job.transition.${to}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
