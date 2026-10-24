import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { roleHome, sessionStore, switchTenant } from '@/entities/auth'

/**
 * POST /auth/switch-tenant. The new tokens replace the session; the app's session
 * watcher clears the cache and reloads /me, and we go to the role's home (the
 * role may differ per tenant).
 */
export function useSwitchTenant() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: switchTenant,
    onSuccess: (tokens) => {
      sessionStore.setTokens(tokens)
      void navigate({ to: roleHome(tokens.role) })
    },
    onError: () => {
      toast.error(t('auth.switchTenant.failed'))
    },
  })
}
