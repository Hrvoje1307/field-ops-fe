import { createRouter } from '@tanstack/react-router'

import { queryClient } from './providers/query-client'
import { routeTree } from './routeTree.gen'

// Inline env check (not env.apiMock) so the bundler drops the previews from non-mock builds
if (import.meta.env.VITE_API_MOCK === 'true') {
  const { addMockRoutes } = await import('./mock-routes')
  addMockRoutes()
}

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  // Let TanStack Query decide freshness for preloaded data
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
