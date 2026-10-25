import { z } from 'zod'

import type { CreateInvitationBody, Role } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface InvitationFormValues {
  email: string
  role: Role
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
  })
}

export const emptyInvitation: InvitationFormValues = { email: '', role: 'technician' }

export function toInvitationBody(values: InvitationFormValues): CreateInvitationBody {
  return { email: values.email.trim().toLowerCase(), role: values.role }
}
