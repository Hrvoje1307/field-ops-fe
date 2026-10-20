import { createFileRoute } from '@tanstack/react-router'

import { FieldDayPage } from '@/pages/field-day'

export const Route = createFileRoute('/_authed/field/')({
  component: FieldDayPage,
})
