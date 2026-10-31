import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getMailThread, listMailThreads, type MailThread } from '@/entities/mail-thread'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { Toaster } from '@/shared/ui/sonner'

import { SaveAttachmentButton } from './save-attachment-button'

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

async function linkedThread(): Promise<MailThread> {
  const page = await listMailThreads({ isSales: true, pageSize: 50 })
  for (const item of page.items.filter((t) => t.deal && t.hasAttachments)) {
    const thread = await getMailThread(item.id)
    if (thread.messages.some((m) => m.attachments.some((a) => !a.savedAttachmentId))) return thread
  }
  throw new Error('seed')
}

async function renderButton(thread: MailThread) {
  const message = thread.messages.find((m) => m.attachments.some((a) => !a.savedAttachmentId))
  const attachment = message?.attachments.find((a) => !a.savedAttachmentId)
  if (!message || !attachment) throw new Error('seed')
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <SaveAttachmentButton thread={thread} message={message} attachment={attachment} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), attachment }
}

describe('SaveAttachmentButton', () => {
  it('is off without a deal and says why', async () => {
    const thread = await linkedThread()
    const { attachment } = await renderButton({ ...thread, deal: null })
    expect(await screen.findByRole('button', { name: 'Spremi na priliku' })).toBeDisabled()
    expect(
      screen.getByText('Razgovor prvo povežite s prilikom, pa spremite privitak.'),
    ).toBeInTheDocument()
    expect(attachment.fileName).toBeTruthy()
  })

  it('with a deal it saves; what is saved is marked with a link to the deal', async () => {
    const thread = await linkedThread()
    const { user, attachment } = await renderButton(thread)
    await user.click(
      await screen.findByRole('button', { name: `Spremi na priliku: ${attachment.fileName}` }),
    )
    expect(await screen.findByText('Privitak je spremljen uz priliku.')).toBeInTheDocument()
  })

  it('already saved: "Spremljeno" with the deal’s files, no button', async () => {
    const thread = await linkedThread()
    const message = thread.messages[0]
    const attachment = {
      partId: 'p',
      fileName: 'ponuda.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      savedAttachmentId: 'abc',
    }
    if (!message) throw new Error('seed')
    await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <SaveAttachmentButton thread={thread} message={message} attachment={attachment} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Spremljeno')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Datoteke prilike' })).toHaveAttribute(
      'href',
      `/sales/deals/${thread.deal?.id ?? ''}`,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('409 thread.not_linked (unlinked meanwhile) is said through the error map', async () => {
    const thread = await linkedThread()
    server.use(
      http.post(`${API}/sales/threads/:id/attachments`, () =>
        HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'thread.not_linked' },
          { status: 409 },
        ),
      ),
    )
    const { user, attachment } = await renderButton(thread)
    await user.click(
      await screen.findByRole('button', { name: `Spremi na priliku: ${attachment.fileName}` }),
    )
    expect(await screen.findByText('Razgovor nije povezan s prilikom.')).toBeInTheDocument()
  })
})
