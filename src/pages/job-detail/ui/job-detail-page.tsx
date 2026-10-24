import { JobDetailView } from '@/widgets/job-detail'

export function JobDetailPage({ jobId }: { jobId: string }) {
  return <JobDetailView jobId={jobId} />
}
