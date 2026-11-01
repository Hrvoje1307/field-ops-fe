import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense, type ReactNode } from 'react'

import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { Toaster } from '@/shared/ui/sonner'

import { signInForTest } from './hook-test-utils'

/** A fresh mock, signed in as a user of the seed (the owner of Alarmko unless told otherwise). */
export async function signInAs(email = 'vlasnik@alarmko.test'): Promise<void> {
  resetMockDb()
  await signInForTest(email)
}

/** The mock rows of Alarmko's Sales data, to arrange a test and to check what was saved. */
export function alarmkoSales() {
  const tenant = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  if (!tenant) throw new Error('seed')
  return tenant.sales
}

/** A screen the way the app renders it: a query client, a Suspense boundary and the toasts. */
export function renderScreen(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{ui}</Suspense>
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}
