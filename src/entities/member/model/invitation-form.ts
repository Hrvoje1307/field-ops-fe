import { z } from 'zod'

import type { CreateInvitationBody, Role } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface InvitationFormValues {
  email: string
  role: Role
  /** Prodaja; a dispatcher's, only on a plan that has it. */
  canAccessSales: boolean
}

/** The platform's roles, in the order they are offered. */
export const ROLES: readonly Role[] = ['dispatcher', 'technician', 'owner']

export function buildInvitationSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, t('settings.team.errors.emailRequired'))
      .pipe(z.email(t('common.errors.emailInvalid'))),
    role: z.enum(['owner', 'dispatcher', 'technician']),
    canAccessSales: z.boolean(),
  })
}

export const emptyInvitation: InvitationFormValues = {
  email: '',
  role: 'technician',
  canAccessSales: false,
}

/**
 * The permission goes with the invitation only where it can apply: a dispatcher's, and
 * `true` (the contract's default is `false`). An owner has it anyway, a technician never.
 */
export function toInvitationBody(values: InvitationFormValues): CreateInvitationBody {
  const body: CreateInvitationBody = {
    email: values.email.trim().toLowerCase(),
    role: values.role,
  }
  if (values.role === 'dispatcher' && values.canAccessSales) body.canAccessSales = true
  return body
}
