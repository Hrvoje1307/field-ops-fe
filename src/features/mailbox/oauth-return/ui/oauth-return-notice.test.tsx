import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { configureSessionStore } from '@/shared/api/session-port'

import { OAuthReturnNotice } from './oauth-return-notice'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

function renderNotice(search: { connected?: string; error?: string }, onClear = vi.fn()) {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <OAuthReturnNotice search={search} onClear={onClear} />
    </QueryClientProvider>,
  )
  return { onClear }
}

describe('OAuthReturnNotice', () => {
  it.each([
    ['access_denied', 'Pristup nije odobren, pa sandučić nije spojen.'],
    ['wrong_account', 'Prijavili ste se drugim računom od onog koji se ponovno spaja.'],
    ['already_connected', 'Ta adresa je već spojena.'],
    ['provider_error', 'Davatelj je javio grešku. Pokušajte ponovno.'],
  ])('says what %s means', (code, text) => {
    renderNotice({ error: code })
    expect(screen.getByRole('alert')).toHaveTextContent(text)
  })

  it('already_connected says the same as the error code sales.mailbox_exists', async () => {
    const { salesErrorMessage } = await import('@/shared/lib/sales-error')
    const { ApiError } = await import('@/shared/api/api-error')
    renderNotice({ error: 'already_connected' })
    const exists = salesErrorMessage(
      new ApiError(409, { status: 409, title: 'Conflict', code: 'sales.mailbox_exists' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(exists)
  })

  it('an unknown code is a general message', () => {
    renderNotice({ error: 'brand_new' })
    expect(screen.getByRole('alert')).toHaveTextContent('Spajanje nije uspjelo. Pokušajte ponovno.')
  })

  it('a connected mailbox is a status message', () => {
    renderNotice({ connected: 'abc' })
    expect(screen.getByRole('status')).toHaveTextContent('Sandučić je spojen.')
  })

  it('clears the address once, keeps the message until it is closed, says nothing without a return', async () => {
    const { onClear } = renderNotice({ error: 'access_denied' })
    expect(onClear).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders nothing and clears nothing when the address says nothing', () => {
    const { onClear } = renderNotice({})
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(onClear).not.toHaveBeenCalled()
  })
})
