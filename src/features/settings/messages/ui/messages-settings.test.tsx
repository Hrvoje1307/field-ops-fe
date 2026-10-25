import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listMessageTemplates } from '@/entities/message-template'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { MessagesSettings } from './messages-settings'

const API = 'http://localhost/api/v1'

async function signInAs(email: string) {
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email, password: 'demo' }))
}

beforeEach(async () => {
  resetMockDb()
  await signInAs('vlasnik@bura.test')
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

function renderMessages() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MessagesSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const group = (name: string) => screen.findByRole('list', { name: `Poruke: ${name}` })

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await group(name.split(' · ')[0] ?? name)
  await user.click(screen.getByRole('button', { name: `Uredi poruku: ${name}` }))
  return screen.findByRole('dialog', { name: 'Uredi poruku' })
}

describe('MessagesSettings', () => {
  it('lists the four kinds of message, each with its channels, the defaults marked', async () => {
    renderMessages()
    const templates = await listMessageTemplates()
    const reminder = await group('Podsjetnik dan prije termina')
    const rows = within(reminder).getAllByRole('listitem')
    expect(rows).toHaveLength(templates.filter((t) => t.key === 'reminder_day_before').length)
    expect(rows[0]).toHaveTextContent('Email')
    expect(rows[0]).toHaveTextContent('Zadano')
    expect(rows[1]).toHaveTextContent('SMS')
    for (const name of [
      'Monter je krenuo prema klijentu',
      'Izvještaj je spreman',
      'Potvrda promjene termina',
    ]) {
      expect(await group(name)).toBeInTheDocument()
    }
  })

  it('a text the tenant wrote has no "Zadano" and can be taken back to the default', async () => {
    await signInAs('vlasnik@alarmko.test')
    renderMessages()
    const onTheWay = await group('Monter je krenuo prema klijentu')
    const row = within(onTheWay).getAllByRole('listitem')[0]
    expect(row).not.toHaveTextContent('Zadano')
    expect(row).toHaveTextContent('Alarmko: monter')
    expect(
      screen.getByRole('button', { name: 'Vrati zadano: Monter je krenuo prema klijentu · SMS' }),
    ).toBeInTheDocument()
    // A platform default cannot be "restored"
    expect(
      screen.queryByRole('button', { name: /Vrati zadano: Potvrda promjene termina/ }),
    ).not.toBeInTheDocument()
  })

  it('editing a platform default writes the tenant’s own text next to it', async () => {
    let method: string | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/message-templates') && request.method !== 'GET') {
        method = request.method
      }
    })
    const user = renderMessages()
    const dialog = await openEditor(user, 'Potvrda promjene termina · SMS')
    const body = within(dialog).getByLabelText(/Tekst poruke/)
    await user.clear(body)
    await user.type(body, 'Novi termin je {{datum}.')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Poruka je spremljena.')).toBeInTheDocument()
    expect(method).toBe('POST')
    const row = within(await group('Potvrda promjene termina')).getAllByRole('listitem')[0]
    await waitFor(() => {
      expect(row).toHaveTextContent('Novi termin je {datum}.')
    })
    expect(row).not.toHaveTextContent('Zadano')
    const saved = (await listMessageTemplates()).find((t) => t.key === 'reschedule_ack')
    expect(saved).toMatchObject({
      isDefault: false,
      body: 'Novi termin je {datum}.',
      channel: 'sms',
    })
  })

  it('changing one it already has is a replace, and it can be switched off', async () => {
    await signInAs('vlasnik@alarmko.test')
    let method: string | undefined
    server.events.on('request:start', ({ request }) => {
      if (/message-templates\/(?!preview)[^/]+$/.test(request.url) && request.method !== 'GET') {
        method = request.method
      }
    })
    const user = renderMessages()
    const dialog = await openEditor(user, 'Monter je krenuo prema klijentu · SMS')
    await user.click(within(dialog).getByLabelText('Šalje se klijentima'))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Poruka je spremljena.')
    expect(method).toBe('PUT')
    expect(
      await within(await group('Monter je krenuo prema klijentu')).findByText('Isključeno'),
    ).toBeInTheDocument()
  })

  it('an e-mail needs a subject and a text; an SMS has no subject field', async () => {
    const user = renderMessages()
    let dialog = await openEditor(user, 'Izvještaj je spreman · Email')
    const subject = within(dialog).getByLabelText(/Naslov emaila/)
    await user.clear(subject)
    await user.clear(within(dialog).getByLabelText(/Tekst poruke/))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Upišite naslov e-maila.')).toBeInTheDocument()
    expect(within(dialog).getByText('Upišite tekst poruke.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Odustani' }))

    dialog = await openEditor(user, 'Izvještaj je spreman · SMS')
    expect(within(dialog).queryByLabelText(/Naslov emaila/)).not.toBeInTheDocument()
  })

  it('a placeholder button puts the word where the cursor is', async () => {
    const user = renderMessages()
    const dialog = await openEditor(user, 'Potvrda promjene termina · SMS')
    const body = within(dialog).getByLabelText<HTMLTextAreaElement>(/Tekst poruke/)
    await user.clear(body)
    await user.type(body, 'Bok , doviđenja')
    act(() => {
      body.setSelectionRange(4, 4)
    })
    await user.click(within(dialog).getByRole('button', { name: 'Umetni: ime klijenta' }))
    expect(body).toHaveValue('Bok {klijent}, doviđenja')
    await waitFor(() => {
      expect(body.selectionStart).toBe(13)
    })
  })

  it('shows the text as the client would get it, with its length and SMS count', async () => {
    const user = renderMessages()
    const dialog = await openEditor(user, 'Potvrda promjene termina · SMS')
    const body = within(dialog).getByLabelText(/Tekst poruke/)
    await user.clear(body)
    await user.type(body, 'Bok ')
    await user.click(within(dialog).getByRole('button', { name: 'Umetni: ime klijenta' }))
    // The preview follows once the typing has stopped
    await waitFor(
      () => {
        expect(within(dialog).getByTestId('message-preview')).toHaveTextContent('Bok Ivan Horvat')
      },
      { timeout: 3000 },
    )
    expect(within(dialog).getByText(/15 znakova · 1 SMS poruka/)).toBeInTheDocument()
  })

  it('warns when the text needs more room because of č, ć, š, ž or đ, and about unknown words', async () => {
    const user = renderMessages()
    const dialog = await openEditor(user, 'Potvrda promjene termina · SMS')
    const body = within(dialog).getByLabelText(/Tekst poruke/)
    await user.clear(body)
    await user.type(body, 'čekamo vas, šaljemo {{nepoznato}')
    await waitFor(
      () => {
        expect(within(dialog).getByText(/zbog kojih stane manje/)).toHaveTextContent('(č š)')
      },
      { timeout: 3000 },
    )
    expect(
      within(dialog).getByText(/Nepoznati dijelovi teksta ostaju kakvi jesu: \{nepoznato\}/),
    ).toBeInTheDocument()
  })

  it('an e-mail preview has no SMS count', async () => {
    const user = renderMessages()
    const dialog = await openEditor(user, 'Izvještaj je spreman · Email')
    expect(await within(dialog).findByTestId('message-preview')).toBeInTheDocument()
    expect(within(dialog).queryByText(/SMS poruk/)).not.toBeInTheDocument()
  })

  it('someone else writing the same text meanwhile (409) closes the panel and says so', async () => {
    server.use(
      http.post(`${API}/message-templates`, () =>
        HttpResponse.json({ status: 409, title: 'Exists' }, { status: 409 }),
      ),
    )
    const user = renderMessages()
    const dialog = await openEditor(user, 'Potvrda promjene termina · SMS')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText(/Netko je u međuvremenu spremio/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Uredi poruku' })).not.toBeInTheDocument()
    })
  })

  it('asks before taking back the default, and does', async () => {
    await signInAs('vlasnik@alarmko.test')
    const user = renderMessages()
    await group('Monter je krenuo prema klijentu')
    await user.click(
      screen.getByRole('button', { name: 'Vrati zadano: Monter je krenuo prema klijentu · SMS' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Vratiti zadanu poruku?' })
    expect((await listMessageTemplates()).find((t) => t.key === 'on_the_way')?.isDefault).toBe(
      false,
    )
    await user.click(within(dialog).getByRole('button', { name: 'Vrati zadano' }))
    await waitFor(async () => {
      expect((await listMessageTemplates()).find((t) => t.key === 'on_the_way')?.isDefault).toBe(
        true,
      )
    })
    expect(
      await within(await group('Monter je krenuo prema klijentu')).findByText('Zadano'),
    ).toBeInTheDocument()
  })

  it('says so when the messages cannot be loaded', async () => {
    server.use(
      http.get(`${API}/message-templates`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderMessages()
    expect(await screen.findByText('Poruke nije moguće učitati.')).toBeInTheDocument()
  })
})
