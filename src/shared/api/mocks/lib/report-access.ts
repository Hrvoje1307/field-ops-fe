import type { JobStatus } from '@/shared/api/generated/model'

import type { JobRow, ReportRow, TenantData } from '../db/rows'
import { isOffice, type Viewer } from './access'
import { conflict } from './problems'

/** The report is filled in on site; the office may correct it until the job is invoiced. */
export function canEditReport(viewer: Viewer, status: JobStatus): boolean {
  return isOffice(viewer) ? status !== 'invoiced' && status !== 'cancelled' : status === 'on_site'
}

export function assertReportEditable(viewer: Viewer, job: JobRow): void {
  if (!canEditReport(viewer, job.status)) {
    throw conflict('job.report_locked', 'Izvještaj se u ovom statusu ne može mijenjati.')
  }
}

/** The job's report, created empty the first time it is read or written. */
export function ensureReport(t: TenantData, jobId: string): ReportRow {
  let report = t.reports.find((r) => r.jobId === jobId)
  if (!report) {
    report = {
      jobId,
      workDone: null,
      startedAt: null,
      finishedAt: null,
      labourMinutes: null,
      signedByName: null,
      completedAt: null,
      signatureAttachmentId: null,
      pdfAttachmentId: null,
    }
    t.reports.push(report)
  }
  return report
}

/** What stops a job from being completed (the messages are the API's, in Croatian). */
export function completionProblems(t: TenantData, job: JobRow, report: ReportRow): string[] {
  const problems: string[] = []
  const open = t.checklistItems.filter(
    (item) => item.jobId === job.id && item.isRequired && !item.isDone,
  )
  if (open.length > 0) {
    problems.push(
      `Obavezne stavke kontrolne liste nisu gotove: ${open.map((i) => i.label).join(', ')}.`,
    )
  }
  if (t.tenant.settings.requireSignature && !report.signatureAttachmentId) {
    problems.push('Potreban je potpis klijenta.')
  }
  if (!report.workDone?.trim()) problems.push('Opis izvršenih radova je obavezan.')
  return problems
}
