import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/entities/session'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import type { TokenResponse } from '@/shared/api/generated/model'

import { SignInForm } from './sign-in-form'

const LOGIN_URL = 'http://localhost/api/v1/auth/login'

function renderForm() {
  const onSignedIn = vi.fn<(tokens: TokenResponse) => void>()
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SignInForm onSignedIn={onSignedIn} />
    </QueryClientProvider>,
  )
  return { onSignedIn, user: userEvent.setup() }
}

async function submit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  const emailInput = screen.getByLabelText('Email')
  const passwordInput = screen.getByLabelText('Lozinka')
  await user.clear(emailInput)
  await user.clear(passwordInput)
  if (email) await user.type(emailInput, email)
  if (password) await user.type(passwordInput, password)
  await user.click(screen.getByRole('button', { name: 'Prijavi se' }))
}

beforeEach(() => {
  resetMockDb()
  sessionStore.clear()
})

describe('SignInForm', () => {
  it('validates the fields before calling the API', async () => {
    const { user, onSignedIn } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Prijavi se' }))
    expect(await screen.findByText('Upišite email.')).toBeInTheDocument()
    expect(screen.getByText('Upišite lozinku.')).toBeInTheDocument()

    await submit(user, 'not-an-email', 'demo')
    expect(await screen.findByText('Upišite ispravan email.')).toBeInTheDocument()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('signs in and starts the session', async () => {
    const { user, onSignedIn } = renderForm()
    await submit(user, 'dispecer@alarmko.test', 'demo')

    await vi.waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledTimes(1)
    })
    expect(onSignedIn.mock.calls[0]?.[0]).toMatchObject({ role: 'dispatcher' })
    expect(sessionStore.getSnapshot()).toMatchObject({ isAuthenticated: true, role: 'dispatcher' })
  })

  it('says "Pogrešan email ili lozinka." on 401', async () => {
    const { user } = renderForm()
    await submit(user, 'dispecer@alarmko.test', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('Pogrešan email ili lozinka.')
  })

  it('shows the wait time from Retry-After when locked out (429)', async () => {
    const { user } = renderForm()
    for (let i = 0; i < 5; i++) {
      await submit(user, 'ivan@alarmko.test', 'wrong')
      await screen.findByRole('alert')
    }
    await submit(user, 'ivan@alarmko.test', 'demo')
    expect(
      await screen.findByText('Previše neuspjelih pokušaja. Pokušajte ponovno za 15 min.'),
    ).toBeInTheDocument()
  })

  it('falls back to a generic 429 message when Retry-After is not exposed', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json(
          { status: 429, title: 'Too many requests' },
          {
            status: 429,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    const { user } = renderForm()
    await submit(user, 'ivan@alarmko.test', 'demo')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Previše pokušaja, pokušajte malo kasnije.',
    )
  })

  it('shows 400 field errors next to the field', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json(
          { status: 400, title: 'Validation failed', errors: { email: ['Račun je zaključan.'] } },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const { user } = renderForm()
    await submit(user, 'ivan@alarmko.test', 'demo')
    expect(await screen.findByText('Račun je zaključan.')).toBeInTheDocument()
    // The field shows its own error; no form-level message on top
    expect(screen.queryByText(/Prijava nije uspjela/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('reports a network failure', async () => {
    server.use(http.post(LOGIN_URL, () => HttpResponse.error()))
    const { user } = renderForm()
    await submit(user, 'ivan@alarmko.test', 'demo')
    expect(await screen.findByRole('alert')).toHaveTextContent('Poslužitelj nije dostupan.')
  })
})
