import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getMailThread, listMailThreads } from '@/entities/mail-thread'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { MailThreadView } from './mail-thread-view'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function renderView(threadId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <MailThreadView
        threadId={threadId}
        attachmentAction={(_thread, _message, attachment) => (
          <button type="button">act {attachment.fileName}</button>
        )}
      />
    </QueryClientProvider>,
  )
}

const firstThread = async () => {
  const page = await listMailThreads({ isSales: true, pageSize: 5 })
  const item = page.items[0]
  if (!item) throw new Error('seed')
  return getMailThread(item.id)
}

describe('MailThreadView', () => {
  it('shows message text as text: markup in it is not parsed and nothing is turned into a link', async () => {
    const thread = await firstThread()
    const evil =
      '<img src=x onerror="alert(1)"> <b>fett</b>\nhttps://example.test/a?b=1\n<script>boom()</script>'
    server.use(
      http.get(`${API}/sales/threads/${thread.id}`, () =>
        HttpResponse.json({
          ...thread,
          messages: [{ ...thread.messages[0], bodyText: evil, attachments: [] }],
        }),
      ),
    )
    await renderView(thread.id)
    const body = await screen.findByText(/fett/)
    expect(body.textContent).toBe(evil)
    expect(body).toHaveClass('whitespace-pre-wrap')
    expect(body.querySelector('img, b, script, a')).toBeNull()
    expect(screen.queryByRole('link', { name: /example\.test/ })).not.toBeInTheDocument()
  })

  it('a body that is not stored shows the snippet and says why', async () => {
    const thread = await firstThread()
    server.use(
      http.get(`${API}/sales/threads/${thread.id}`, () =>
        HttpResponse.json({
          ...thread,
          messages: [
            { ...thread.messages[0], bodyText: null, snippet: 'Početak poruke', attachments: [] },
          ],
        }),
      ),
    )
    await renderView(thread.id)
    expect(await screen.findByText('Početak poruke')).toBeInTheDocument()
    expect(screen.getByText('Sadržaj nije spremljen.')).toBeInTheDocument()
  })

  it('names every mailbox the API says the conversation is in, and only the messages it returns', async () => {
    const thread = await firstThread()
    server.use(
      http.get(`${API}/sales/threads/${thread.id}`, () =>
        HttpResponse.json({
          ...thread,
          mailboxes: [
            { id: 'a', emailAddress: 'info@firma.test', kind: 'shared', canSend: true },
            { id: 'b', emailAddress: 'ana@firma.test', kind: 'personal', canSend: true },
          ],
          messages: thread.messages.slice(0, 1),
        }),
      ),
    )
    await renderView(thread.id)
    const labels = await screen.findByRole('list', { name: 'Sandučići' })
    expect(within(labels).getByText(/info@firma\.test \(zajednički\)/)).toBeInTheDocument()
    expect(within(labels).getByText(/ana@firma\.test \(osobni\)/)).toBeInTheDocument()
    expect(screen.getAllByTestId('thread-message')).toHaveLength(1)
  })

  it('gives the attachment to the caller’s action', async () => {
    const page = await listMailThreads({ isSales: true, pageSize: 50 })
    const item = page.items.find((t) => t.hasAttachments)
    if (!item) throw new Error('seed')
    await renderView(item.id)
    expect(await screen.findByRole('button', { name: /^act / })).toBeInTheDocument()
  })

  it('says so when the conversation is gone or cannot be loaded', async () => {
    server.use(
      http.get(`${API}/sales/threads/:id`, () =>
        HttpResponse.json({ status: 404, title: 'Not found' }, { status: 404 }),
      ),
    )
    await renderView('x')
    expect(
      await screen.findByText('Razgovor ne postoji ili ga ne možete vidjeti.'),
    ).toBeInTheDocument()
  })

  it('says so when loading fails, with a retry', async () => {
    server.use(
      http.get(`${API}/sales/threads/:id`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    await renderView('x')
    expect(await screen.findByText('Razgovor nije moguće učitati.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokušaj ponovno' })).toBeInTheDocument()
  })
})
