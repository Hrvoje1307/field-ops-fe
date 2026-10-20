import { useQueryClient } from '@tanstack/react-query'

import { sessionStore } from '@/entities/session'
import { useLogin } from '@/shared/api/generated/auth/auth'

/** POST /auth/login; on success the session starts with an empty cache. */
export function useSignIn() {
  const queryClient = useQueryClient()
  return useLogin({
    mutation: {
      onSuccess: (tokens) => {
        queryClient.clear()
        sessionStore.setTokens(tokens)
      },
    },
  })
}
