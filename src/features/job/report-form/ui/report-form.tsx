import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useGetJob, useGetJobHistory, type Job } from '@/entities/job'
import {
  completionBlockers,
  type JobReport,
  useGetJobReport,
  useSaveJobReport,
} from '@/entities/report'
import { useGetTenant } from '@/entities/tenant'
import { dateInTimeZone } from '@/shared/lib/datetime'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { useAutosave } from '../model/use-autosave'
import {
  arrivalInstant,
  draftErrors,
  draftFromReport,
  draftToInput,
  inputOf,
  type ReportDraft,
} from '../model/report-draft'
import { ChecklistSection } from './checklist-section'
import { CompleteBar } from './complete-bar'
import { MaterialsSection } from './materials-section'
import { PhotosSection } from './photos-section'
import { SignatureSection } from './signature-section'
import { TimesSection } from './times-section'
import { WorkDoneSection } from './work-done-section'

/**
 * The technician's report for the job they are on site at: what was done, times, the
 * checklist, materials, photos, the client's signature, and the button that completes
 * the job. The text is saved as it is typed; ticks, materials, photos and the
 * signature are saved as they are added.
 */
export function ReportForm({ jobId, onCompleted }: { jobId: string; onCompleted: () => void }) {
  const { t } = useTranslation()
  const job = useGetJob(jobId)
  const report = useGetJobReport(jobId)
  const history = useGetJobHistory(jobId)
  const tenant = useGetTenant()

  if (job.isPending || report.isPending || history.isPending || tenant.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (job.isError || report.isError || history.isError || tenant.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('report.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void Promise.all([
                job.refetch(),
                report.refetch(),
                history.refetch(),
                tenant.refetch(),
              ])
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return (
    <Loaded
      job={job.data}
      report={report.data}
      arrival={arrivalInstant(history.data)}
      requireSignature={tenant.data.settings.requireSignature ?? true}
      onCompleted={onCompleted}
    />
  )
}

function Loaded({
  job,
  report,
  arrival,
  requireSignature,
  onCompleted,
}: {
  job: Job
  report: JobReport
  arrival: string | null
  requireSignature: boolean
  onCompleted: () => void
}) {
  const { t } = useTranslation()
  const { timeZone, today } = useTenantFormat()
  const save = useSaveJobReport(job.id)
  // What is typed is kept here; the server's copy is looked at only to start from
  const [draft, setDraft] = useState<ReportDraft>(() =>
    draftFromReport(report, { timeZone, arrival }),
  )
  const [saved] = useState(() => inputOf(report))
  const day = job.scheduledDate ?? dateInTimeZone(arrival ?? new Date().toISOString(), timeZone)
  const input = useMemo(
    () => draftToInput(draft, report, { day: day || today(), timeZone }),
    [draft, report, day, today, timeZone],
  )
  const autosave = useAutosave(input, saved, (body) => save.mutateAsync(body))
  // Completing saves what is typed, and stamps the finish when none was entered
  const saveDraft = async () => {
    await autosave.flush()
    if (!input.finishedAt) {
      await save.mutateAsync({ ...input, finishedAt: new Date().toISOString() })
    }
  }
  const errors = draftErrors(draft)
  const blockers = completionBlockers(
    {
      workDone: draft.workDone,
      checklist: report.checklist,
      signatureAttachmentId: report.signatureAttachmentId,
    },
    { requireSignature },
  )

  return (
    <div className="space-y-8 pb-28">
      <header className="space-y-1">
        <Link
          to="/field/jobs/$jobId"
          params={{ jobId: job.id }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          {t('report.back')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t('report.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {job.number} · {job.title}
        </p>
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {autosave.status === 'saving'
            ? t('report.save.saving')
            : autosave.status === 'saved'
              ? t('report.save.saved')
              : autosave.status === 'failed'
                ? t('report.save.failed')
                : ' '}
        </p>
      </header>

      <WorkDoneSection
        value={draft.workDone}
        onChange={(workDone) => {
          setDraft((current) => ({ ...current, workDone }))
        }}
      />
      <TimesSection
        draft={draft}
        errors={errors}
        onChange={(changes) => {
          setDraft((current) => ({ ...current, ...changes }))
        }}
      />
      <ChecklistSection jobId={job.id} items={report.checklist} />
      <MaterialsSection jobId={job.id} materials={report.materials} total={report.totalMaterials} />
      <PhotosSection jobId={job.id} photos={report.photos} />
      <SignatureSection jobId={job.id} report={report} required={requireSignature} />

      <CompleteBar
        jobId={job.id}
        number={job.number}
        blockers={blockers}
        saveDraft={saveDraft}
        onCompleted={onCompleted}
      />
    </div>
  )
}
