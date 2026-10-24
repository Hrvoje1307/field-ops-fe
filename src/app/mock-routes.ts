import { type AnyRoute, createRoute } from '@tanstack/react-router'

import { CustomFieldsPreviewPage } from '@/pages/dev-custom-fields'

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
}
