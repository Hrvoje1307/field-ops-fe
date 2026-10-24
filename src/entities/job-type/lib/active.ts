import type { JobType } from '@/shared/api/generated/model'

/** Job types offered for new jobs; inactive ones stay visible on existing jobs. */
export function activeJobTypes(jobTypes: readonly JobType[]): JobType[] {
  return jobTypes.filter((jobType) => jobType.isActive)
}
