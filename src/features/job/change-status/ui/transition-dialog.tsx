import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { handleJobConflict, type Job, transitionNeedsNote } from '@/entities/job'
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
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Textarea } from '@/shared/ui/textarea'

import type { DialogStatus } from '../config/menu'
import { changeStatusErrorMessage, useChangeStatus } from '../model/use-change-status'

/**
 * Confirms a status change; asks for the reason where the contract requires a note
 * (cancel, on hold). On 409 the job is refetched and the dialog stays open with the
 * note kept: try again if the change is still allowed, otherwise it says so.
 */
export function TransitionDialog({
  job,
  to,
  onClose,
}: {
  /** The live job (from the detail query), so a refetch after 409 shows here. */
  job: Pick<Job, 'id' | 'number' | 'version' | 'allowedTransitions'>
  to: DialogStatus
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const changeStatus = useChangeStatus()
  const noteId = useId()
  const needsNote = transitionNeedsNote(to)
  const [conflicted, setConflicted] = useState(false)
  const stillAllowed = job.allowedTransitions.includes(to)

  const schema = useMemo(
    () =>
      z.object({
        note: needsNote
          ? z.string().trim().min(1, t('job.transitionDialog.noteRequired'))
          : z.string().trim(),
      }),
    [needsNote, t],
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
      await changeStatus.mutateAsync({ job, to, note: needsNote ? note : undefined })
      toast.success(t('job.changeStatus.done', { status: t(`job.status.${to}`) }))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        setConflicted(true)
        await handleJobConflict(queryClient)
        return
      }
      if (error instanceof ApiError && error.status === 400) {
        const unmatched = applyFieldErrors(setError, error.fieldErrors, needsNote ? ['note'] : [])
        if (unmatched.length > 0) toast.error(unmatched.join(' '))
        return
      }
      toast.error(changeStatusErrorMessage(error, t))
    }
  })

  const blocked = conflicted && !stillAllowed

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
            <DialogTitle>{t(`job.transition.${to}`)}</DialogTitle>
            <DialogDescription>
              {t(`job.transitionDialog.description.${to}`, { number: job.number })}
            </DialogDescription>
          </DialogHeader>

          {conflicted && (
            <Alert role="alert" variant={blocked ? 'destructive' : 'default'}>
              <AlertDescription>
                {blocked
                  ? t('job.transitionDialog.noLongerAllowed')
                  : t('job.transitionDialog.changed')}
              </AlertDescription>
            </Alert>
          )}

          {needsNote && (
            <Field data-invalid={errors.note ? true : undefined}>
              <FieldLabel htmlFor={noteId}>{t('job.transitionDialog.note')}</FieldLabel>
              <Textarea
                id={noteId}
                rows={3}
                autoFocus
                aria-required="true"
                aria-invalid={errors.note ? true : undefined}
                aria-describedby={errors.note ? `${noteId}-error` : undefined}
                {...register('note')}
              />
              <FieldError id={`${noteId}-error`} errors={[errors.note]} />
            </Field>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {blocked ? t('common.close') : t('common.cancel')}
              </Button>
            </DialogClose>
            {!blocked && (
              <Button
                type="submit"
                variant={to === 'cancelled' ? 'destructive' : 'default'}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('job.changeStatus.saving') : t(`job.transition.${to}`)}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
