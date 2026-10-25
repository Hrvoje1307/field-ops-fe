import { CheckIcon, DownloadIcon, PrinterIcon, SquareIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AttachmentImage,
  type JobReport,
  useGetAttachmentUrl,
  useGetJobReport,
  usePrintJobReport,
} from '@/entities/report'
import { closeDocumentWindow, openDocumentWindow, showHtml } from '@/shared/lib/print-window'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Skeleton } from '@/shared/ui/skeleton'

/**
 * The job's report as it stands, read-only: what was done, times, checklist, materials,
 * photos, the signature, and the printable version and PDF. For the office, and for a
 * technician looking at a job that is no longer theirs to edit.
 */
export function ReportView({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const report = useGetJobReport(jobId)

  if (report.isPending) {
    return (
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (report.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('report.view.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void report.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <Loaded jobId={jobId} report={report.data} />
}

function isEmpty(report: JobReport): boolean {
  return (
    !report.workDone?.trim() &&
    !report.startedAt &&
    !report.finishedAt &&
    report.materials.length === 0 &&
    report.photos.length === 0 &&
    !report.signatureAttachmentId &&
    !report.checklist.some((item) => item.isDone)
  )
}

function Loaded({ jobId, report }: { jobId: string; report: JobReport }) {
  const { t } = useTranslation()
  const { formatTime, formatRelativeDateTime, formatDuration, formatMoney, formatNumber } =
    useTenantFormat()
  const [viewing, setViewing] = useState<number | null>(null)
  const headingId = useId()
  const hasTimes = Boolean(report.startedAt ?? report.finishedAt) || report.labourMinutes != null

  return (
    <section aria-labelledby={headingId} className="space-y-4" data-testid="report-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {t('report.view.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton jobId={jobId} />
          <PdfLink report={report} />
        </div>
      </div>

      {isEmpty(report) ? (
        <p className="text-sm text-muted-foreground">{t('report.view.empty')}</p>
      ) : (
        <div className="space-y-5">
          {report.completedAt && (
            <p className="text-sm text-muted-foreground">
              {t('report.view.completedAt', { when: formatRelativeDateTime(report.completedAt) })}
            </p>
          )}
          {report.workDone?.trim() && (
            <Block title={t('report.view.workDone')}>
              <p className="whitespace-pre-wrap">{report.workDone}</p>
            </Block>
          )}
          {hasTimes && (
            <Block title={t('report.view.times')}>
              <p>
                {report.startedAt &&
                  report.finishedAt &&
                  t('report.view.from', {
                    start: formatTime(report.startedAt),
                    end: formatTime(report.finishedAt),
                  })}
                {report.labourMinutes != null && (
                  <span className="block text-muted-foreground">
                    {t('report.view.labour', { duration: formatDuration(report.labourMinutes) })}
                  </span>
                )}
              </p>
            </Block>
          )}
          {report.checklist.length > 0 && (
            <Block title={t('report.view.checklist')}>
              <ul className="space-y-1">
                {report.checklist.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    {item.isDone ? (
                      <CheckIcon
                        aria-label={t('common.yes')}
                        className="mt-0.5 size-4 text-green-700"
                      />
                    ) : (
                      <SquareIcon
                        aria-label={t('common.no')}
                        className="mt-0.5 size-4 text-muted-foreground"
                      />
                    )}
                    <span>
                      {item.label}
                      {item.isDone && item.doneByName && (
                        <span className="block text-xs text-muted-foreground">
                          {item.doneByName}
                          {item.doneAt ? `, ${formatRelativeDateTime(item.doneAt)}` : ''}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {report.materials.length > 0 && (
            <Block title={t('report.view.materials')}>
              <ul className="divide-y rounded-lg border">
                {report.materials.map((material) => (
                  <li key={material.id} className="flex justify-between gap-3 p-2.5">
                    <span>
                      {material.name}
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(Number(material.quantity))} {material.unit}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatMoney(material.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {report.totalMaterials !== undefined && (
                <p className="mt-2 text-right font-medium">
                  {t('report.materials.total', { amount: formatMoney(report.totalMaterials) })}
                </p>
              )}
            </Block>
          )}
          {report.photos.length > 0 && (
            <Block title={t('report.view.photos')}>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {report.photos.map((photo, index) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className="block w-full overflow-hidden rounded-lg"
                      aria-label={t('report.photos.open', { index: index + 1 })}
                      onClick={() => {
                        setViewing(index)
                      }}
                    >
                      <AttachmentImage
                        attachmentId={photo.id}
                        thumbnail
                        alt={t('report.photos.alt', { index: index + 1 })}
                        className="aspect-square w-full"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title={t('report.view.signature')}>
            {report.signatureAttachmentId ? (
              <div className="space-y-2">
                <AttachmentImage
                  attachmentId={report.signatureAttachmentId}
                  alt={t('report.signature.alt')}
                  className="h-28 w-64 max-w-full rounded-lg border bg-white object-contain"
                />
                <p>{t('report.view.signedBy', { name: report.signedByName ?? '' })}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">{t('report.view.notSigned')}</p>
            )}
          </Block>
        </div>
      )}

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
      >
        <DialogContent className="p-2">
          <DialogTitle className="sr-only">{t('report.photos.viewer')}</DialogTitle>
          <DialogDescription className="sr-only">{t('report.photos.viewer')}</DialogDescription>
          {viewing !== null && report.photos[viewing] && (
            <AttachmentImage
              attachmentId={report.photos[viewing].id}
              alt={t('report.photos.alt', { index: viewing + 1 })}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  )
}

/** The printable report is fetched with the token and shown as a blob URL. */
function PrintButton({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const print = usePrintJobReport()
  return (
    <Button
      variant="outline"
      disabled={print.isPending}
      onClick={() => {
        // The window is opened inside the click (or the browser blocks it) and filled when the document is here
        const target = openDocumentWindow()
        print.mutate(jobId, {
          onSuccess: (html) => {
            showHtml(target, html)
          },
          onError: () => {
            closeDocumentWindow(target)
            toast.error(t('report.view.printFailed'))
          },
        })
      }}
    >
      <PrinterIcon aria-hidden="true" />
      {t('report.view.print')}
    </Button>
  )
}

/** The PDF is made after completion; until it is there the report says so. */
function PdfLink({ report }: { report: JobReport }) {
  const { t } = useTranslation()
  const link = useGetAttachmentUrl(report.pdfAttachmentId)
  if (!report.completedAt) return null
  if (!report.pdfAttachmentId) {
    return (
      <span role="status" className="text-sm text-muted-foreground">
        {t('report.view.pdfPending')}
      </span>
    )
  }
  if (link.isError) {
    return (
      <Button variant="outline" onClick={() => void link.refetch()}>
        {t('report.view.pdfFailed')}
      </Button>
    )
  }
  return (
    <Button asChild variant="outline" disabled={!link.data}>
      <a href={link.data?.url} target="_blank" rel="noreferrer">
        <DownloadIcon aria-hidden="true" />
        {t('report.view.pdf')}
      </a>
    </Button>
  )
}
