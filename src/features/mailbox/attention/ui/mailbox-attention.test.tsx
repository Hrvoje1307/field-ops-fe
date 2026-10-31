import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { MailboxAttention } from './mailbox-attention'

const API = 'http://localhost/api/v1'

async function signInAs(email: string) {
  sessionStore.clear()
  sessionStore.setTokens(await login({ email, password: 'demo' }))
}

beforeEach(() => {
  resetMockDb()
  configureSessionStore(sessionStore)
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(<MailboxAttention />, {
    wrap: (children) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  })
}

describe('MailboxAttention', () => {
  it('the owner is told which mailbox needs attention, what the server said, and gets a link to the page', async () => {
    await signInAs('vlasnik@bura.test')
    await renderBanner()
    const banner = await screen.findByTestId('mailbox-attention')
    expect(banner).toHaveTextContent('Sandučić Maja Radić (maja.radic@bura.test) javlja grešku.')
    expect(banner).toHaveTextContent('IMAP: prijava nije uspjela')
    expect(within(banner).getByRole('link', { name: 'Otvori sandučiće' })).toHaveAttribute(
      'href',
      '/settings/sales/mailboxes',
    )
    expect(banner).not.toHaveTextContent('Javi vlasniku')
  })

  it('a dispatcher is told to tell the owner, with no button and no link', async () => {
    await signInAs('dispecer@bura.test')
    await renderBanner()
    const banner = await screen.findByTestId('mailbox-attention')
    expect(banner).toHaveTextContent('maja.radic@bura.test')
    expect(banner).toHaveTextContent('Javi vlasniku.')
    expect(within(banner).queryByRole('link')).not.toBeInTheDocument()
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument()
  })

  it('a mailbox that needs to be connected again says so', async () => {
    await signInAs('vlasnik@alarmko.test')
    const info = Object.values((await import('@/shared/api/mocks/db')).getDb().tenants)
      .find((t) => t.tenant.slug === 'alarmko')
      ?.sales.mailboxes.find((m) => m.kind === 'shared')
    if (!info) throw new Error('seed')
    info.status = 'needs_reauth'
    info.lastError = 'Pristup je opozvan.'
    await renderBanner()
    expect(await screen.findByTestId('mailbox-attention')).toHaveTextContent(
      'Sandučić Alarmko info (info@alarmko.test) treba ponovno spajanje.',
    )
  })

  it('shows nothing when all mailboxes are well, and nothing while it loads', async () => {
    await signInAs('vlasnik@alarmko.test')
    await renderBanner()
    expect(screen.queryByTestId('mailbox-attention')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('says so, and can try again, when Today cannot be loaded; a 403 says it is not theirs', async () => {
    await signInAs('vlasnik@bura.test')
    server.use(
      http.get(`${API}/sales/today`, () =>
        HttpResponse.json(
          { status: 403, title: 'Forbidden', code: 'sales.forbidden' },
          { status: 403 },
        ),
      ),
    )
    await renderBanner()
    expect(await screen.findByRole('alert')).toHaveTextContent('Nemate pristup prodaji.')
    expect(screen.getByRole('button', { name: 'Pokušaj ponovno' })).toBeInTheDocument()
  })
})
