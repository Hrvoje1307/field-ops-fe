import { createFileRoute, notFound } from '@tanstack/react-router'

import { CustomFieldsPreviewPage } from '@/pages/dev-custom-fields'
import { env } from '@/shared/config/env'

/** Developer preview of the custom-field renderer; only with the mock API. */
export const Route = createFileRoute('/_authed/dev/custom-fields')({
  beforeLoad: () => {
    if (!env.apiMock) throw notFound()
  },
  component: CustomFieldsPreviewPage,
})
