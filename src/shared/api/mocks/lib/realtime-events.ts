import type {
  JobStatusChangedEvent,
  JobUpdatedEvent,
  RoutePlanPublishedEvent,
} from '@/shared/api/generated/model'

import type { TenantData } from '../db/rows'

/** What a job looked like, as far as anyone watching it would notice a change. */
interface JobSignature {
  status: string
  scheduledDate: string | null
  scheduledStart: string | null
  locked: boolean
  version: number
  deleted: boolean
  /** Lead first. */
  technicianIds: string[]
}

export interface TenantSnapshot {
  jobs: Map<string, JobSignature>
  plans: Map<string, { status: string; date: string }>
}

export function snapshotOf(t: TenantData): TenantSnapshot {
  const jobs = new Map<string, JobSignature>()
  for (const job of t.jobs) {
    const assigned = t.assignments
      .filter((a) => a.jobId === job.id)
      .sort((a, b) => Number(b.isLead) - Number(a.isLead))
    jobs.set(job.id, {
      status: job.status,
      scheduledDate: job.scheduledDate ?? null,
      scheduledStart: job.scheduledStart ?? null,
      locked: job.locked,
      version: job.version,
      deleted: Boolean(job.deletedAt),
      technicianIds: assigned.map((a) => a.technicianId),
    })
  }
  const plans = new Map<string, { status: string; date: string }>()
  for (const plan of t.routePlans) plans.set(plan.id, { status: plan.status, date: plan.date })
  return { jobs, plans }
}

/** One message of the hub, and who gets it. */
export type HubMessage =
  | { target: 'JobUpdated'; payload: JobUpdatedEvent; technicianIds: string[] }
  | { target: 'JobStatusChanged'; payload: JobStatusChangedEvent; technicianIds: string[] }
  | { target: 'RoutePlanPublished'; payload: RoutePlanPublishedEvent; technicianIds: 'all' }

const sameJob = (a: JobSignature, b: JobSignature) =>
  a.status === b.status &&
  a.scheduledDate === b.scheduledDate &&
  a.scheduledStart === b.scheduledStart &&
  a.locked === b.locked &&
  a.version === b.version &&
  a.deleted === b.deleted &&
  a.technicianIds.join() === b.technicianIds.join()

/**
 * The events a write caused, found by comparing the tenant before and after: a changed,
 * new or removed job is `JobUpdated`, a changed status also `JobStatusChanged`, a plan
 * that became published `RoutePlanPublished`. Like the real hub's, they are thin.
 */
export function eventsBetween(
  before: TenantSnapshot,
  after: TenantSnapshot,
  now: string,
): HubMessage[] {
  const messages: HubMessage[] = []
  for (const [jobId, current] of after.jobs) {
    const previous = before.jobs.get(jobId)
    if (previous && sameJob(previous, current)) continue
    if (!previous && current.deleted) continue
    // Whoever was on the job before or is now hears about it
    const technicianIds = [
      ...new Set([...(previous?.technicianIds ?? []), ...current.technicianIds]),
    ]
    messages.push({
      target: 'JobUpdated',
      payload: { jobId, scheduledDate: current.scheduledDate },
      technicianIds,
    })
    if (previous && previous.status !== current.status) {
      messages.push({
        target: 'JobStatusChanged',
        payload: {
          jobId,
          from: previous.status as JobStatusChangedEvent['from'],
          to: current.status as JobStatusChangedEvent['to'],
          technicianId: current.technicianIds[0] ?? null,
          changedAt: now,
        },
        technicianIds,
      })
    }
  }
  for (const [planId, plan] of after.plans) {
    if (plan.status === 'published' && before.plans.get(planId)?.status !== 'published') {
      messages.push({
        target: 'RoutePlanPublished',
        payload: { routePlanId: planId, date: plan.date },
        technicianIds: 'all',
      })
    }
  }
  return messages
}
