import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fetchMe, login, sessionStore } from '@/entities/auth'
import { getDeal } from '@/entities/deal'
import { listMailThreads } from '@/entities/mail-thread'
import { listSalesStages } from '@/entities/sales-stage'
import { resetMockDb } from '@/shared/api/mocks/db'
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

async function renderPanel(threadId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <MailThreadPanel threadId={threadId} onWon={() => undefined} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function withoutAi() {
  const me = await fetchMe(new QueryClient())
  server.use(
    http.get(`${API}/me`, () =>
      HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
    ),
  )
}

describe('MailThreadPanel', () => {
  it('with the AI: the card, the category, the summary', async () => {
    const [item] = (await listMailThreads({ isSales: true, pageSize: 5 })).items
    await renderPanel(item?.id ?? '')
    expect(await screen.findByRole('region', { name: 'Što je AI prepoznao' })).toBeInTheDocument()
  })

  it('without `sales_ai` there is nothing of the AI, but linking, excluding and saving still work', async () => {
    await withoutAi()
    const [item] = (await listMailThreads({ isSales: true, pageSize: 5 })).items
    await renderPanel(item?.id ?? '')
    await screen.findByRole('article')
    expect(screen.queryByRole('region', { name: 'Što je AI prepoznao' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ponovno obradi' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Isključi pošiljatelja' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Odveži' }) ??
        screen.getByRole('button', { name: 'Poveži s prilikom' }),
    ).toBeInTheDocument()
  })

  it('moving to the AI’s suggested stage is a button for a linked deal, and the deal moves only when it is pressed', async () => {
    const page = await listMailThreads({ isSales: true, pageSize: 50 })
    let target: { threadId: string; dealId: string; stageId: string } | null = null
    for (const item of page.items) {
      const suggested = item.classification?.suggestedStageId
      if (!item.deal || !suggested) continue
      const deal = await getDeal(item.deal.id)
      if (deal.stage.id !== suggested && deal.stage.kind === 'open') {
        const stage = (await listSalesStages({})).find((s) => s.id === suggested)
        if (stage?.kind === 'open') {
          target = { threadId: item.id, dealId: deal.id, stageId: suggested }
          break
        }
      }
    }
    if (!target) throw new Error('seed: a linked deal whose suggested stage is another open stage')
    const user = await renderPanel(target.threadId)
    const region = await screen.findByRole('region', { name: 'Što je AI prepoznao' })
    expect(await within(region).findByText(/Predložena faza:/)).toBeInTheDocument()
    // Seeing the suggestion changes nothing
    expect((await getDeal(target.dealId)).stage.id).not.toBe(target.stageId)
    await user.click(await within(region).findByRole('button', { name: /^Premjesti u / }))
    await waitFor(async () => {
      expect((await getDeal(target.dealId)).stage.id).toBe(target.stageId)
    })
  })

  it('without a deal the suggestion is only text', async () => {
    const page = await listMailThreads({ isSales: true, pageSize: 50 })
    const target = page.items.find((t) => !t.deal && t.classification?.suggestedStageId)
    if (!target) throw new Error('seed: an unlinked conversation with a suggested stage')
    await renderPanel(target.id)
    const region = await screen.findByRole('region', { name: 'Što je AI prepoznao' })
    expect(await within(region).findByText(/Predložena faza:/)).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: /^Premjesti u / })).not.toBeInTheDocument()
  })
})
