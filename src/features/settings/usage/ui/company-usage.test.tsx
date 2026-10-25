import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'

import { CompanyUsage } from './company-usage'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

function renderUsage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CompanyUsage />
    </QueryClientProvider>,
  )
}

describe('CompanyUsage', () => {
  it('shows the month’s messages and optimizations', async () => {
    server.use(
      http.get('http://localhost/api/v1/tenant/usage', () =>
        HttpResponse.json({
          month: '2026-10',
          smsCount: 1234,
          smsCost: '61.70',
          emailCount: 8,
          optimizationsCount: 3,
        }),
      ),
    )
    renderUsage()
    const figures = await screen.findByTestId('tenant-usage')
    expect(figures).toHaveTextContent('SMS poruke')
    expect(figures).toHaveTextContent(/1\.?234/)
    expect(figures).toHaveTextContent(/61,70/)
    expect(figures).toHaveTextContent('Optimizacije ruta')
  })

  it('says so when the usage cannot be loaded', async () => {
    server.use(
      http.get('http://localhost/api/v1/tenant/usage', () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderUsage()
    expect(await screen.findByText('Potrošnju nije moguće učitati.')).toBeInTheDocument()
  })
})
