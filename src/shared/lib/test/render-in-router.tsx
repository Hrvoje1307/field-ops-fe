import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Renders `ui` inside an in-memory router, for components with `Link`s. Links to
 * other routes render with their href; they don't navigate to anything real.
 */
export async function renderInRouter(
  ui: ReactNode,
  { wrap }: { wrap?: (children: ReactNode) => ReactNode } = {},
) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const content = <RouterProvider router={router} />
  return render(wrap ? wrap(content) : content)
}
