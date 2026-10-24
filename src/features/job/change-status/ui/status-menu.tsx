import { useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleJobConflict, type Job, type JobStatus } from '@/entities/job'
import { isConflict } from '@/shared/api/api-error'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Spinner } from '@/shared/ui/spinner'

import { type DialogStatus, menuTargets, needsDialog } from '../config/menu'
import { changeStatusErrorMessage, useChangeStatus } from '../model/use-change-status'
import { TransitionDialog } from './transition-dialog'

/**
 * "Promijeni status": one entry per change the API allows the current user now
 * (`Job.allowedTransitions`). No menu when there is none.
 */
export function StatusMenu({
  job,
}: {
  job: Pick<Job, 'id' | 'number' | 'version' | 'allowedTransitions'>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const changeStatus = useChangeStatus()
  const [dialogFor, setDialogFor] = useState<DialogStatus | null>(null)

  const targets = menuTargets(job.allowedTransitions)

  const choose = (to: JobStatus) => {
    if (needsDialog(to)) {
      setDialogFor(to)
      return
    }
    changeStatus.mutate(
      { job, to },
      {
        onSuccess: () => {
          toast.success(t('job.changeStatus.done', { status: t(`job.status.${to}`) }))
        },
        onError: (error) => {
          if (isConflict(error)) void handleJobConflict(queryClient)
          else toast.error(changeStatusErrorMessage(error, t))
        },
      },
    )
  }

  return (
    <>
      {targets.length > 0 && (
        // Not modal: the dialog it opens must get focus and pointer events
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={changeStatus.isPending}>
              {changeStatus.isPending ? <Spinner /> : null}
              {changeStatus.isPending ? t('job.changeStatus.saving') : t('job.changeStatus.menu')}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {targets.map((to) => (
              <DropdownMenuItem
                key={to}
                variant={to === 'cancelled' ? 'destructive' : 'default'}
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
      {/* Stays open after a 409 even if the refetched job allows no change at all */}
      {dialogFor && (
        <TransitionDialog
          key={dialogFor}
          job={job}
          to={dialogFor}
          onClose={() => {
            setDialogFor(null)
          }}
        />
      )}
    </>
  )
}
