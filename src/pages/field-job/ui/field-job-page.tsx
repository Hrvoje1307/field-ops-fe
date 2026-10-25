import { FieldJobView } from '@/widgets/field-job'

export function FieldJobPage({ jobId }: { jobId: string }) {
  return <FieldJobView jobId={jobId} />
}
