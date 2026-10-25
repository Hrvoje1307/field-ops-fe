import type { TFunction } from 'i18next'

import type { JobReport } from '@/shared/api/generated/model'

/** What still has to be done before a job can be completed. */
export type CompletionBlocker =
  { kind: 'checklist'; labels: string[] } | { kind: 'signature' } | { kind: 'workDone' }

/**
 * The API's completion rules (required checklist items, a signature when the tenant
 * asks for one, the work done), checked up front so the technician sees what is
 * missing before pressing the button. The API still decides (422).
 */
export function completionBlockers(
  report: Pick<JobReport, 'workDone' | 'checklist' | 'signatureAttachmentId'>,
  { requireSignature }: { requireSignature: boolean },
): CompletionBlocker[] {
  const blockers: CompletionBlocker[] = []
  const open = report.checklist.filter((item) => item.isRequired && !item.isDone)
  if (open.length > 0) blockers.push({ kind: 'checklist', labels: open.map((item) => item.label) })
  if (!report.workDone?.trim()) blockers.push({ kind: 'workDone' })
  if (requireSignature && !report.signatureAttachmentId) blockers.push({ kind: 'signature' })
  return blockers
}

export function blockerText(t: TFunction, blocker: CompletionBlocker): string {
  switch (blocker.kind) {
    case 'checklist':
      return t('report.blockers.checklist', { items: blocker.labels.join(', ') })
    case 'signature':
      return t('report.blockers.signature')
    case 'workDone':
      return t('report.blockers.workDone')
  }
}
