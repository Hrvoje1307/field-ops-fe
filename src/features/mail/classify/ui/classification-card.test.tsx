import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getMailThread, listMailThreads, type MailThread } from '@/entities/mail-thread'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { ClassificationCard } from './classification-card'

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

async function thread(pick: (t: MailThread) => boolean = () => true) {
  const page = await listMailThreads({ isSales: true, pageSize: 50 })
  for (const item of page.items) {
    const full = await getMailThread(item.id)
    if (pick(full)) return full
  }
  throw new Error('seed')
}

function renderCard(value: MailThread, suggestedStage?: (id: string) => React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ClassificationCard thread={value} suggestedStage={suggestedStage} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('ClassificationCard', () => {
  it('shows the AI’s confidence for its own result, and for a user’s correction none', async () => {
    renderCard(await thread((t) => t.classification?.source === 'ai'))
    expect(screen.getByText(/Sigurnost: \d+ %/)).toBeInTheDocument()
  })

  it('a corrected conversation says who corrected it and has no percentage', async () => {
    renderCard(await thread((t) => t.classification?.source === 'user'))
    expect(screen.getAllByText('Ispravio korisnik').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Sigurnost/)).not.toBeInTheDocument()
  })

  it('"Za pregled" is what the API says (needsReview), not something worked out here', async () => {
    const value = await thread((t) => t.classification?.source === 'ai')
    renderCard({ ...value, needsReview: true })
    expect(screen.getAllByText('Za pregled').length).toBeGreaterThan(0)
  })

  it('the AI’s suggested stage is only handed to what the caller renders; nothing is moved', async () => {
    const value = await thread((t) => Boolean(t.classification?.suggestedStageId))
    renderCard({ ...value }, (id) => <p>prijedlog {id}</p>)
    expect(
      screen.getByText(`prijedlog ${value.classification?.suggestedStageId ?? ''}`),
    ).toBeInTheDocument()
  })

  it('reprocess: 409 sales.ai_disabled and 429 with the wait are said through the error map', async () => {
    const value = await thread()
    const user = renderCard(value)
    server.use(
      http.post(`${API}/sales/threads/:id/reprocess`, () =>
        HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'sales.ai_disabled' },
          { status: 409 },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Ponovno obradi' }))
    expect(
      await screen.findByText('AI je isključen u paketu ili u postavkama prodaje.'),
    ).toBeInTheDocument()

    server.use(
      http.post(`${API}/sales/threads/:id/reprocess`, () =>
        HttpResponse.json(
          { status: 429, title: 'Too many', code: 'sales.ai_quota_exceeded' },
          { status: 429, headers: { 'Retry-After': '7200' } },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Ponovno obradi' }))
    expect(
      await screen.findByText(/Mjesečna AI kvota je potrošena\. Pokušajte ponovno za 2 sata/),
    ).toBeInTheDocument()
  })

  it('a correction always sends both fields', async () => {
    const value = await thread((t) => t.classification?.source === 'ai')
    let sent: unknown
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT' && request.url.endsWith('/classification')) {
        void request
          .clone()
          .json()
          .then((body) => {
            sent = body
          })
      }
    })
    const user = renderCard(value)
    await user.click(screen.getByRole('button', { name: 'Administracija' }))
    await waitFor(() => {
      expect(sent).toEqual({ category: 'admin', isSales: false })
    })
  })

  it('says the AI is working, and does not allow another run meanwhile', async () => {
    const value = await thread()
    renderCard({ ...value, aiStatus: 'pending' })
    expect(screen.getByText('AI još obrađuje razgovor…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ponovno obradi' })).toBeDisabled()
  })
})
