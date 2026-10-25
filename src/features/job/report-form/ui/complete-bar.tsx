import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useCompleteJob } from '@/entities/job'
import { blockerText, type CompletionBlocker } from '@/entities/report'
import { ApiError, isConflict } from '@/shared/api/api-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/spinner'

/**
 * The one big action of the report screen. It says what is still missing, saves the
 * draft, then completes the job (with the phone's position when it comes in time).
 */
export function CompleteBar({
  jobId,
  number,
  blockers,
  saveDraft,
  onCompleted,
}: {
  jobId: string
  number: string
  blockers: CompletionBlocker[]
  /** Saves what is typed; rejects when it could not be saved. */
  saveDraft: () => Promise<void>
  onCompleted: () => void
}) {
  const { t } = useTranslation()
  const complete = useCompleteJob()
  const [sendToClient, setSendToClient] = useState(true)
  const blockersId = useId()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const blocked = blockers.length > 0

  async function finish() {
    setRefused(null)
    setBusy(true)
    try {
      try {
        await saveDraft()
      } catch {
        toast.error(t('report.complete.saveFirst'))
        return
      }
      await complete.mutateAsync({
        id: jobId,
        sendReportToClient: sendToClient,
        withPosition: true,
      })
      toast.success(t('report.complete.done', { number }))
      onCompleted()
    } catch (error) {
      if (isConflict(error)) return // the hook has refetched and told the user
      if (error instanceof ApiError && error.status === 422) {
        const detail = (error.problem as { detail?: string }).detail
        setRefused(t('report.complete.requirements', { reason: detail ?? '' }))
      } else {
        toast.error(t('report.complete.failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section aria-label={t('report.complete.action')} className="space-y-3">
        {blocked && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            data-testid="completion-blockers"
            id={blockersId}
          >
            <p className="font-medium">{t('report.complete.missing')}</p>
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker.kind}>{blockerText(t, blocker)}</li>
              ))}
            </ul>
          </div>
        )}
        {refused && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{refused}</AlertDescription>
          </Alert>
        )}
        <label className="flex min-h-12 items-center gap-3 text-base">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={sendToClient}
            onChange={(event) => {
              setSendToClient(event.target.checked)
            }}
          />
          {t('report.complete.sendToClient')}
        </label>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={blocked || busy}
            aria-describedby={blocked ? blockersId : undefined}
            onClick={() => {
              void finish()
            }}
          >
            {busy ? <Spinner aria-hidden="true" role="presentation" /> : null}
            {busy ? t('report.complete.completing') : t('report.complete.action')}
          </Button>
        </div>
      </div>
    </>
  )
}
