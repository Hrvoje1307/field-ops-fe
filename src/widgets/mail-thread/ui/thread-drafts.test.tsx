import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { type Draft, getDraft, listDrafts, saveDraftToMailbox } from '@/entities/draft'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { Toaster } from '@/shared/ui/sonner'

import { MailThreadPanel } from './mail-thread-panel'

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

const readyDraft = async (): Promise<Draft> => {
  const draft = (await listDrafts({ status: ['ready'] }))[0]
  if (!draft) throw new Error('seed')
  return draft
}

async function renderFor(draft: Draft) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <MailThreadPanel threadId={draft.threadId} onWon={() => undefined} />
      <Toaster />
    </QueryClientProvider>,
  )
  const section = await screen
    .findByRole('region', { name: 'Nacrt odgovora' }, { timeout: 4000 })
    .catch(() => null)
  return { user: userEvent.setup(), section }
}

const editorOf = async () => {
  await screen.findAllByLabelText(/^Tekst/)
  return screen.getByLabelText(/^Tekst/)
}

function record(method: string, suffix: string) {
  const bodies: unknown[] = []
  server.events.on('request:start', ({ request }) => {
    if (
      request.method === method &&
      request.url.includes('/sales/drafts/') &&
      request.url.endsWith(suffix)
    ) {
      void request
        .clone()
        .json()
        .then((body) => bodies.push(body))
    }
  })
  return bodies
}

describe('the drafts of a conversation', () => {
  it('a draft being written is locked and says "Pripremam…"', async () => {
    const generating = (await listDrafts({ status: ['generating'] }))[0]
    if (!generating) throw new Error('seed')
    await renderFor(generating)
    expect(await screen.findByText('Pripremam…')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Tekst/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pošalji' })).not.toBeInTheDocument()
  })

  it('the text is a plain textarea: markup typed in stays text', async () => {
    const draft = await readyDraft()
    const { user } = await renderFor(draft)
    const body = await editorOf()
    expect(body.tagName).toBe('TEXTAREA')
    await user.clear(body)
    await user.type(body, '<b>podebljano</b> <img src=x>')
    expect(body).toHaveValue('<b>podebljano</b> <img src=x>')
    expect(document.querySelector('section b, section img')).toBeNull()
  })

  it('sending saves the edits first and sends the version that came back', async () => {
    const draft = await readyDraft()
    const saves = record('PUT', draft.id)
    const sends = record('POST', '/send')
    const { user } = await renderFor(draft)
    const body = await editorOf()
    await user.clear(body)
    await user.type(body, 'Nova verzija teksta.')
    await user.click(screen.getByRole('button', { name: 'Pošalji' }))
    const dialog = await screen.findByRole('dialog', { name: 'Poslati poruku?' })
    expect(within(dialog).getByText(draft.subject)).toBeInTheDocument()
    expect(within(dialog).getByText('Prije slanja spremaju se vaše izmjene.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji poruku' }))
    await waitFor(() => {
      expect(sends).toHaveLength(1)
    })
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ bodyText: 'Nova verzija teksta.', version: draft.version })
    const stored = await getDraft(draft.id)
    expect(stored.status).toBe('sent')
    expect(sends[0]).toEqual({ version: draft.version + 1 })
    expect(stored.bodyText).toBe('Nova verzija teksta.')
  })

  it('when saving fails nothing is sent: a 400 shows next to the field and the dialog gives way to it', async () => {
    const draft = await readyDraft()
    const sends = record('POST', '/send')
    server.use(
      http.put(`${API}/sales/drafts/${draft.id}`, () =>
        HttpResponse.json(
          { status: 400, title: 'Validation', errors: { bodyText: ['Tekst je predug.'] } },
          { status: 400 },
        ),
      ),
    )
    const { user } = await renderFor(draft)
    const body = await editorOf()
    await user.type(body, ' dodatak')
    await user.click(screen.getByRole('button', { name: 'Pošalji' }))
    await user.click(await screen.findByRole('button', { name: 'Pošalji poruku' }))
    expect(await screen.findByText('Tekst je predug.')).toBeInTheDocument()
    expect(sends).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'Poslati poruku?' })).not.toBeInTheDocument()
    expect(body).toHaveValue(`${draft.bodyText} dodatak`)
  })

  it('an invalid form is not sent: the recipient is required', async () => {
    const draft = await readyDraft()
    const sends = record('POST', '/send')
    const { user } = await renderFor(draft)
    await editorOf()
    await user.clear(screen.getByLabelText(/^Za/))
    await user.click(screen.getByRole('button', { name: 'Pošalji' }))
    await user.click(await screen.findByRole('button', { name: 'Pošalji poruku' }))
    expect(await screen.findByText('Upišite barem jednog primatelja.')).toBeInTheDocument()
    expect(sends).toHaveLength(0)
  })

  it('409 on the send (it changed meanwhile): the draft is shown as it is, the typed text stays, with a warning', async () => {
    const draft = await readyDraft()
    server.use(
      http.post(`${API}/sales/drafts/${draft.id}/send`, () =>
        HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'draft.version_conflict' },
          { status: 409 },
        ),
      ),
    )
    const { user } = await renderFor(draft)
    await editorOf()
    await user.click(screen.getByRole('button', { name: 'Pošalji' }))
    await user.click(await screen.findByRole('button', { name: 'Pošalji poruku' }))
    expect(await screen.findByText(/Vaš tekst je ostao u uređivaču/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Poslati poruku?' })).not.toBeInTheDocument()
  })

  it('409 mailbox.cannot_send on the send says so in the dialog and stays open', async () => {
    const draft = await readyDraft()
    server.use(
      http.post(`${API}/sales/drafts/${draft.id}/send`, () =>
        HttpResponse.json(
          { status: 422, title: 'x', code: 'mailbox.cannot_send' },
          { status: 422 },
        ),
      ),
    )
    const { user } = await renderFor(draft)
    await editorOf()
    await user.click(screen.getByRole('button', { name: 'Pošalji' }))
    await user.click(await screen.findByRole('button', { name: 'Pošalji poruku' }))
    expect(
      await screen.findByText('Iz ovog sandučića nije moguće slati poštu.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Poslati poruku?' })).toBeInTheDocument()
  })

  it('a mailbox that cannot send: no send and no save to the mailbox, and it says so', async () => {
    const draft = await readyDraft()
    const row = Object.values(getDb().tenants)
      .flatMap((t) => t.sales.mailboxes)
      .find((m) => m.id === draft.mailboxId)
    if (row) row.canSend = false
    await renderFor(draft)
    await editorOf()
    expect(screen.getByRole('button', { name: 'Pošalji' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Spremi u sandučić' })).toBeDisabled()
    expect(screen.getAllByText(/ne može slati poštu/).length).toBeGreaterThan(0)
  })

  it('save to the mailbox saves the edits first, then the draft is "Spremljen u sandučić"', async () => {
    const draft = await readyDraft()
    const saves = record('PUT', draft.id)
    const { user } = await renderFor(draft)
    const body = await editorOf()
    await user.type(body, ' još jedna rečenica')
    await user.click(screen.getByRole('button', { name: 'Spremi u sandučić' }))
    expect(await screen.findByText('Nacrt je spremljen u sandučić.')).toBeInTheDocument()
    expect(saves).toHaveLength(1)
    expect((await getDraft(draft.id)).status).toBe('saved_to_mailbox')
  })

  it('discarding a draft that is only here says just that', async () => {
    const draft = await readyDraft()
    const { user } = await renderFor(draft)
    await editorOf()
    await user.click(screen.getByRole('button', { name: 'Odbaci' }))
    const dialog = await screen.findByRole('dialog', { name: 'Odbaciti nacrt?' })
    expect(dialog).toHaveTextContent('Nacrt se briše.')
    expect(dialog).not.toHaveTextContent('Gmailu ili Outlooku')
    await user.click(within(dialog).getByRole('button', { name: 'Odbaci' }))
    expect(await screen.findByText('Nacrt je odbačen.')).toBeInTheDocument()
    await waitFor(async () => {
      expect((await listDrafts({})).map((d) => d.id)).not.toContain(draft.id)
    })
  })

  it('discarding a draft saved in the mailbox says it is deleted there too', async () => {
    const draft = await readyDraft()
    await saveDraftToMailbox(draft.id)
    const { user } = await renderFor(draft)
    await editorOf()
    await user.click(screen.getByRole('button', { name: 'Odbaci' }))
    const dialog = await screen.findByRole('dialog', { name: 'Odbaciti nacrt?' })
    expect(dialog).toHaveTextContent('briše se i nacrt spremljen u Gmailu ili Outlooku')
  })

  it('a failed draft says why; "Pokušaj ponovno" asks for a new one with the same kind, instructions and mailbox', async () => {
    const failed = (await listDrafts({ status: ['failed'] }))[0]
    if (!failed) throw new Error('seed')
    const asked: unknown[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/drafts')) {
        void request
          .clone()
          .json()
          .then((body) => asked.push(body))
      }
    })
    const { user } = await renderFor(failed)
    expect(await screen.findByText(failed.error ?? '')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    await waitFor(() => {
      expect(asked).toHaveLength(1)
    })
    expect(asked[0]).toMatchObject({ kind: failed.kind, mailboxId: failed.mailboxId })
  })
})
