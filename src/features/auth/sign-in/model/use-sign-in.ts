import { useMutation, useQueryClient } from '@tanstack/react-query'

import { login, sessionStore } from '@/entities/auth'

/** POST /auth/login; on success the session starts with an empty cache. */
export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: (tokens) => {
      queryClient.clear()
      sessionStore.setTokens(tokens)
    },
  })
}
