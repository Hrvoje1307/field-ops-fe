import { type AnyRoute, createRoute } from '@tanstack/react-router'

import { CustomFieldsPreviewPage } from '@/pages/dev-custom-fields'

import { MockOAuthPage } from '@/shared/api/mocks/ui/mock-oauth-page'

import { Route as RootRoute } from './routes/__root'
import { Route as AuthedRoute } from './routes/_authed'

/**
 * Developer previews, only with the mock API. They are code-based routes added to the
 * generated tree before the router is created; router.ts imports this module only when
 * VITE_API_MOCK=true, so other builds contain none of it.
 */
export function addMockRoutes() {
  const customFields = createRoute({
    getParentRoute: () => AuthedRoute,
    path: '/dev/custom-fields',
    component: CustomFieldsPreviewPage,
  })
  // routeTree.gen.ts has already set the file routes; at runtime `children` is an array
  const fileRoutes = AuthedRoute.children as AnyRoute[]
  AuthedRoute.addChildren([...fileRoutes, customFields])

  // The stand-in for a mail provider's consent page (the mock's `authorizeUrl` points here)
  const oauth = createRoute({
    getParentRoute: () => RootRoute,
    path: '/mock-oauth/$provider',
    validateSearch: (search: Record<string, unknown>) => ({
      state: typeof search.state === 'string' ? search.state : '',
    }),
    component: function MockOAuthRoute() {
      const { provider } = oauth.useParams()
      const { state } = oauth.useSearch()
      return <MockOAuthPage provider={provider} state={state} />
    },
  })
  RootRoute.addChildren([...(RootRoute.children as AnyRoute[]), oauth])
}
