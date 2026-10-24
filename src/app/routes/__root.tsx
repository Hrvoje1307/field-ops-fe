import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { ErrorPage } from '@/pages/error'
import { NotFoundPage } from '@/pages/not-found'
import { Toaster } from '@/shared/ui/sonner'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
})

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
      {/* Dev only; off in Playwright runs, where they would cover buttons */}
      {import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS !== 'false' && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </>
  )
}
