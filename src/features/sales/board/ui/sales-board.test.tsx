import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSalesBoard } from '@/entities/deal'
import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'

import { SalesBoard } from './sales-board'

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

async function renderBoard(props: Partial<Parameters<typeof SalesBoard>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <SalesBoard onMove={() => undefined} {...props} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const emptyBoard = async () => {
  const board = await getSalesBoard({})
  return {
    columns: board.columns.map((column) => ({
      ...column,
      deals: [],
      totalCount: 0,
      totalValue: null,
    })),
  }
}

describe('SalesBoard', () => {
  it('shows a column per stage in the API order, with colours and names from the API', async () => {
    await renderBoard()
    const board = await getSalesBoard({})
    const region = await screen.findByRole('region', { name: 'Lijevak prodaje' })
    const headings = within(region).getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual(board.columns.map((c) => c.stage.name))
    const first = board.columns[0]
    expect(within(region).getByText(first?.stage.name ?? '').firstElementChild).toHaveStyle({
      backgroundColor: first?.stage.color ?? '',
    })
  })

  it('follows the API when it orders the stages differently from the usual', async () => {
    const real = await getSalesBoard({})
    server.use(
      http.get(`${API}/sales/board`, () =>
        HttpResponse.json({ columns: [...real.columns].reverse() }),
      ),
    )
    await renderBoard()
    const region = await screen.findByRole('region', { name: 'Lijevak prodaje' })
    expect(
      within(region)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(real.columns.map((c) => c.stage.name).reverse())
  })

  it('says so when the board cannot be loaded, and loads again on retry', async () => {
    server.use(
      http.get(`${API}/sales/board`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = await renderBoard()
    expect(await screen.findByText('Lijevak nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await screen.findByRole('region', { name: 'Lijevak prodaje' })).toBeInTheDocument()
  })

  it('a tenant without deals gets an invitation to add one, and the empty stages are still there', async () => {
    const empty = await emptyBoard()
    server.use(http.get(`${API}/sales/board`, () => HttpResponse.json(empty)))
    await renderBoard({ emptyAction: <button type="button">Nova prilika</button> })
    expect(await screen.findByText('Još nema prilika')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova prilika' })).toBeInTheDocument()
    const region = screen.getByRole('region', { name: 'Lijevak prodaje' })
    expect(within(region).getAllByText('Nema prilika u ovoj fazi.')).toHaveLength(
      empty.columns.length,
    )
  })

  it('an empty stage says so while others have cards', async () => {
    const real = await getSalesBoard({})
    const emptied = real.columns.map((column, index) =>
      index === 0 ? { ...column, deals: [], totalCount: 0, totalValue: null } : column,
    )
    server.use(http.get(`${API}/sales/board`, () => HttpResponse.json({ columns: emptied })))
    await renderBoard()
    const first = await screen.findByRole('region', { name: real.columns[0]?.stage.name ?? '' })
    expect(within(first).getByText('Nema prilika u ovoj fazi.')).toBeInTheDocument()
  })

  it('a search without hits says what was searched', async () => {
    const empty = await emptyBoard()
    const real = await getSalesBoard({})
    server.use(
      http.get(`${API}/sales/board`, ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get('q') ? empty : real),
      ),
    )
    const user = await renderBoard()
    await screen.findByRole('region', { name: 'Lijevak prodaje' })
    await user.type(screen.getByRole('searchbox', { name: 'Traži prilike' }), 'nema')
    expect(
      await screen.findByText('Nijedna prilika ne odgovara pretrazi "nema".'),
    ).toBeInTheDocument()
  })
})
