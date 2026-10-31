import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fetchMe, login, sessionStore } from '@/entities/auth'
import { getSalesSettings } from '@/entities/sales-config'
import { getMailThread, listMailThreads, type MailThread } from '@/entities/mail-thread'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { Toaster } from '@/shared/ui/sonner'

import { CreateDraftSection } from './create-draft-section'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

async function sharedThread(): Promise<MailThread> {
  const page = await listMailThreads({ isSales: true, pageSize: 50 })
  const item = page.items.find((t) => t.mailbox.kind === 'shared')
  if (!item) throw new Error('seed')
  return getMailThread(item.id)
}

async function renderSection(thread: MailThread) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <CreateDraftSection thread={thread} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Pripremi nacrt' }))
  return screen.findByRole('dialog', { name: 'Pripremi nacrt odgovora' })
}

describe('CreateDraftSection', () => {
  it('without `sales_ai` there is no button; the conversation is answered from one’s own mail', async () => {
    const me = await fetchMe(new QueryClient())
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
      ),
    )
    await renderSection(await sharedThread())
    expect(await screen.findByText(/odgovorite iz vlastitog maila/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pripremi nacrt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('with the AI switched off in the settings there is no button either', async () => {
    const settings = await getSalesSettings()
    server.use(
      http.get(`${API}/sales/settings`, () => HttpResponse.json({ ...settings, aiEnabled: false })),
    )
    await renderSection(await sharedThread())
    expect(await screen.findByText(/AI je isključen u postavkama prodaje/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pripremi nacrt' })).not.toBeInTheDocument()
  })

  it('counts the instructions against the limit of 1000', async () => {
    const user = await renderSection(await sharedThread())
    const dialog = await open(user)
    const text = within(dialog).getByLabelText('Upute za nacrt')
    expect(text).toHaveAttribute('maxlength', '1000')
    await user.type(text, 'Ponudi utorak')
    expect(within(dialog).getByText('13 od 1000')).toBeInTheDocument()
  })

  it('offers only mailboxes of the conversation that can send; the thread’s own is the default', async () => {
    const thread = await sharedThread()
    const mixed: MailThread = {
      ...thread,
      mailboxes: [
        { id: 'a', emailAddress: 'nema-slanja@firma.test', kind: 'shared', canSend: false },
        { id: 'b', emailAddress: 'salje@firma.test', kind: 'shared', canSend: true },
        { id: 'c', emailAddress: 'salje2@firma.test', kind: 'personal', canSend: true },
      ],
      mailbox: { ...thread.mailbox, id: 'c' },
    }
    const user = await renderSection(mixed)
    const dialog = await open(user)
    const select = within(dialog).getByLabelText('Šalje se iz sandučića')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['salje@firma.test', 'salje2@firma.test'])
    expect(select).toHaveValue('c')
  })

  it('when no mailbox can send, it says why a draft cannot be made and does not offer to ask', async () => {
    const thread = await sharedThread()
    const user = await renderSection({
      ...thread,
      mailboxes: thread.mailboxes.map((m) => ({ ...m, canSend: false })),
    })
    const dialog = await open(user)
    expect(
      within(dialog).getByText(/Nijedan sandučić ovog razgovora ne može slati poštu/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Pripremi nacrt' })).toBeDisabled()
  })

  it('asks for the draft with the kind, the instructions and the mailbox; 202 says it is being prepared', async () => {
    const thread = await sharedThread()
    let sent: unknown
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/drafts')) {
        void request
          .clone()
          .json()
          .then((body) => {
            sent = body
          })
      }
    })
    const user = await renderSection(thread)
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('radio', { name: 'Praćenje' }))
    await user.type(within(dialog).getByLabelText('Upute za nacrt'), 'Podsjeti na ponudu.')
    await user.click(within(dialog).getByRole('button', { name: 'Pripremi nacrt' }))
    expect(await screen.findByText('Nacrt se priprema.')).toBeInTheDocument()
    expect(sent).toMatchObject({
      kind: 'follow_up',
      instructions: 'Podsjeti na ponudu.',
      mailboxId: thread.mailbox.id,
    })
  })

  it('429 says when to try again; 409 sales.ai_disabled and mailbox.cannot_send through the error map', async () => {
    const user = await renderSection(await sharedThread())
    server.use(
      http.post(`${API}/sales/threads/:id/drafts`, () =>
        HttpResponse.json(
          { status: 429, title: 'Too many', code: 'sales.ai_quota_exceeded' },
          { status: 429, headers: { 'Retry-After': '86400' } },
        ),
      ),
    )
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Pripremi nacrt' }))
    expect(
      await within(dialog).findByText(
        /Mjesečna AI kvota je potrošena\. Pokušajte ponovno za 1 dan/,
      ),
    ).toBeInTheDocument()
    server.use(
      http.post(`${API}/sales/threads/:id/drafts`, () =>
        HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'mailbox.cannot_send' },
          { status: 409 },
        ),
      ),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Pripremi nacrt' }))
    expect(
      await within(dialog).findByText('Iz ovog sandučića nije moguće slati poštu.'),
    ).toBeInTheDocument()
  })
})
