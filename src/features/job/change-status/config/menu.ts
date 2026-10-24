import type { JobStatus } from '@/entities/job'

/**
 * Not offered in the office menu even when allowed: completing goes through
 * `POST /jobs/{id}/complete` with the work report (step 12), never `/transition`.
 */
const NOT_IN_MENU: readonly JobStatus[] = ['completed']

/** Changes that open a dialog: a required note (contract), or a confirmation. */
export const DIALOG_STATUSES = ['new', 'on_hold', 'invoiced', 'cancelled'] as const

export type DialogStatus = (typeof DIALOG_STATUSES)[number]

export function needsDialog(to: JobStatus): to is DialogStatus {
  return (DIALOG_STATUSES as readonly JobStatus[]).includes(to)
}

/** Menu entries: the API's `allowedTransitions`, minus what the menu doesn't do. */
export function menuTargets(allowedTransitions: readonly JobStatus[]): JobStatus[] {
  return allowedTransitions.filter((to) => !NOT_IN_MENU.includes(to))
}
