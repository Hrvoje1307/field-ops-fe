import { FieldJob } from '@/features/field/job'
import { FieldStatusBar } from '@/features/job/field-status'

/** A job on the phone: its information with the status action fixed at the bottom. */
export function FieldJobView({ jobId }: { jobId: string }) {
  return <FieldJob jobId={jobId} bottomBar={<FieldStatusBar jobId={jobId} />} />
}
