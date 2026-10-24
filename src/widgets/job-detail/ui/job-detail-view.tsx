import { StatusMenu } from '@/features/job/change-status'
import { JobDetails } from '@/features/job/details'
import { JobHistory } from '@/features/job/history'

/** A job for the office: its details with the status menu and the status history. */
export function JobDetailView({ jobId }: { jobId: string }) {
  return (
    <JobDetails
      jobId={jobId}
      actions={<StatusMenu jobId={jobId} />}
      history={<JobHistory jobId={jobId} />}
    />
  )
}
