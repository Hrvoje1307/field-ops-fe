import { cn } from 'cn'

import type { JobSummary } from '@/shared/api/generated/model'
import { ColorDot } from '@/shared/ui/color-dot'

/** The job's type in its configured colour. */
export function JobTypeTag({
  jobType,
  className,
}: {
  jobType: Pick<JobSummary['jobType'], 'name' | 'color'>
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <ColorDot color={jobType.color} />
      {jobType.name}
    </span>
  )
}
