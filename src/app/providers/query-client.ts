import { QueryClient } from '@tanstack/react-query'

import { shouldRetry } from '@/shared/api/retry'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
    },
  },
})
