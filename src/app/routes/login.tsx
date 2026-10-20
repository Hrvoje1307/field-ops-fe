import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { LOGIN_REASONS, safeRedirect, sessionStore } from '@/entities/session'
import { LoginPage } from '@/pages/login'

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  reason: z.enum(LOGIN_REASONS).optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  // Already signed in: go on (the role guards pick the right area)
  beforeLoad: ({ search }) => {
    if (sessionStore.getSnapshot().isAuthenticated) {
      throw redirect({ href: safeRedirect(search.redirect) ?? '/', replace: true })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { redirect: target, reason } = Route.useSearch()
  return <LoginPage redirect={target} reason={reason} />
}
