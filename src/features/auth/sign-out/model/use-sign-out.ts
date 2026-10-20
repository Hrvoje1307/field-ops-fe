import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { sessionStore } from '@/entities/session'
import { logout } from '@/shared/api/generated/auth/auth'

/**
 * Signs out here: revokes the refresh token family on the server (best effort,
 * offline must not block), clears the session (other tabs follow via the
 * storage event) and goes to plain /login. The app's session watcher drops the
 * cached data once /login is shown.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate()

  return useCallback(() => {
    const refreshToken = sessionStore.getRefreshToken()
    // The request is sent with the current token before the session is cleared
    if (refreshToken) logout({ refreshToken }).catch(() => undefined)
    sessionStore.clear('signed_out')
    void navigate({ to: '/login' })
  }, [navigate])
}
