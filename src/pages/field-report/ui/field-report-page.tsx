import { FieldReportView } from '@/widgets/field-report'

/** The technician's report for a job (phone). */
export function FieldReportPage({
  jobId,
  onCompleted,
}: {
  jobId: string
  onCompleted: () => void
}) {
  return <FieldReportView jobId={jobId} onCompleted={onCompleted} />
}
