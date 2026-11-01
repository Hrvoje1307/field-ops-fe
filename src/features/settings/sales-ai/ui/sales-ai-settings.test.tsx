import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fetchMe } from '@/entities/auth'
import { getSalesSettings } from '@/entities/sales-config'
import { server } from '@/shared/api/mocks/node'
import { alarmkoSales, renderScreen, signInAs } from '@/shared/api/test/screen-test-utils'

import { SalesAiSettings } from './sales-ai-settings'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  await signInAs()
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

const form = () => screen.findByRole('form', { name: 'AI i znanje' })
const save = () => screen.getByRole('button', { name: 'Spremi' })

describe('SalesAiSettings', () => {
  it('shows what is stored: the tone, the language, the threshold as a percent, the hours', async () => {
    alarmkoSales().settings.reviewThreshold = 0.85
    alarmkoSales().settings.tone = 'friendly'
    renderScreen(<SalesAiSettings />)
    await form()
    expect(screen.getByLabelText('Ton')).toHaveValue('friendly')
    expect(screen.getByLabelText('Jezik odgovora')).toHaveValue('auto')
    expect(screen.getByLabelText('Prag sigurnosti')).toHaveValue('85')
    expect(screen.getByLabelText('Rok za prvi odgovor (sati)')).toHaveValue('4')
  })

  it('offers "auto", the tenant language named by the browser, and a typed tag; no fixed list', async () => {
    const user = renderScreen(<SalesAiSettings />)
    await form()
    const select = screen.getByLabelText('Jezik odgovora')
    expect(
      within(select)
        .getAllByRole('option')
        .slice(1)
        .map((o) => o.textContent),
    ).toEqual(['Jezik klijenta', 'Jezik tvrtke: hrvatski', 'Drugi jezik…'])
    await user.selectOptions(select, 'other')
    await user.type(screen.getByLabelText(/Oznaka jezika/), 'en_GB')
    await user.click(save())
    expect(await screen.findByText(/Upišite ispravnu oznaku jezika/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Oznaka jezika/))
    await user.type(screen.getByLabelText(/Oznaka jezika/), 'en-GB')
    await user.click(save())
    await waitFor(() => {
      expect(alarmkoSales().settings.replyLanguage).toBe('en-GB')
    })
  })

  it('counts the knowledge and refuses more than 20 000 characters without sending anything', async () => {
    const user = renderScreen(<SalesAiSettings />)
    await form()
    fireEvent.change(screen.getByLabelText('Što AI smije reći'), {
      target: { value: 'x'.repeat(20_001) },
    })
    expect(screen.getByTestId('knowledge-count')).toHaveTextContent('20001 od 20000 znakova')
    const puts: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') puts.push(request.url)
    })
    await user.click(save())
    expect(await screen.findByText('Znanje može imati najviše 20 000 znakova.')).toBeInTheDocument()
    expect(puts).toEqual([])
  })

  it('sends the threshold as 0–1 and saves the fields of this screen', async () => {
    const user = renderScreen(<SalesAiSettings />)
    await form()
    await user.clear(screen.getByLabelText('Prag sigurnosti'))
    await user.type(screen.getByLabelText('Prag sigurnosti'), '55')
    await user.selectOptions(screen.getByLabelText('Ton'), 'formal')
    await user.clear(screen.getByLabelText('Potpis'))
    await user.type(screen.getByLabelText('Potpis'), 'Ekipa')
    await user.click(save())
    expect(await screen.findByText('Postavke su spremljene.')).toBeInTheDocument()
    expect(await getSalesSettings()).toMatchObject({
      reviewThreshold: 0.55,
      tone: 'formal',
      signature: 'Ekipa',
    })
  })

  it('does not touch the digest’s fields', async () => {
    alarmkoSales().settings.digestTime = '06:15'
    alarmkoSales().settings.storeNonSalesBodies = true
    const user = renderScreen(<SalesAiSettings />)
    await form()
    await user.selectOptions(screen.getByLabelText('Ton'), 'friendly')
    await user.click(save())
    await screen.findByText('Postavke su spremljene.')
    expect(await getSalesSettings()).toMatchObject({
      tone: 'friendly',
      digestTime: '06:15',
      storeNonSalesBodies: true,
    })
  })

  it('a retention deletes mail, so it is said first and nothing is saved until it is confirmed', async () => {
    const user = renderScreen(<SalesAiSettings />)
    await form()
    await user.type(screen.getByLabelText('Obriši sadržaj razgovora nakon (dana)'), '90')
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'Spremiti i obrisati sadržaj?' })
    expect(dialog).toHaveTextContent('briše se sadržaj razgovora bez aktivnosti')
    expect(alarmkoSales().settings.retentionDays).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Odustani' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(alarmkoSales().settings.retentionDays).toBeNull()

    await user.click(save())
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Spremi i obriši' }),
    )
    await waitFor(() => {
      expect(alarmkoSales().settings.retentionDays).toBe(90)
    })
  })

  it('a longer retention, or removing it, needs no confirmation', async () => {
    alarmkoSales().settings.retentionDays = 90
    const user = renderScreen(<SalesAiSettings />)
    await form()
    await user.clear(screen.getByLabelText('Obriši sadržaj razgovora nakon (dana)'))
    await user.type(screen.getByLabelText('Obriši sadržaj razgovora nakon (dana)'), '120')
    await user.click(save())
    await screen.findByText('Postavke su spremljene.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(alarmkoSales().settings.retentionDays).toBe(120)
  })

  it('with the AI off the tone, knowledge and threshold stay visible and say they are not used', async () => {
    alarmkoSales().settings.aiEnabled = false
    renderScreen(<SalesAiSettings />)
    await form()
    expect(screen.getAllByText('AI je isključen, pa se ove postavke ne koriste.')).toHaveLength(3)
    expect(screen.getByLabelText('Ton')).toBeEnabled()
    expect(screen.getByLabelText('Što AI smije reći')).toBeEnabled()
    expect(screen.getByLabelText('Prag sigurnosti')).toBeEnabled()
  })

  it('without the AI in the plan it says so instead', async () => {
    const me = await fetchMe(new QueryClient())
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
      ),
    )
    renderScreen(<SalesAiSettings />)
    await form()
    expect(
      screen.getAllByText('Vaš paket ne uključuje AI. Ove postavke se ne koriste.'),
    ).toHaveLength(3)
  })

  it('a 400 shows next to the field and keeps what was typed; a failed load can be retried', async () => {
    const user = renderScreen(<SalesAiSettings />)
    await form()
    server.use(
      http.put(`${API}/sales/settings`, () =>
        HttpResponse.json(
          { status: 400, title: 'Bad', errors: { responseSlaHours: ['Najviše 168.'] } },
          { status: 400 },
        ),
      ),
    )
    await user.clear(screen.getByLabelText('Rok za prvi odgovor (sati)'))
    await user.type(screen.getByLabelText('Rok za prvi odgovor (sati)'), '12')
    await user.click(save())
    expect(await screen.findByText('Najviše 168.')).toBeInTheDocument()
    expect(screen.getByLabelText('Rok za prvi odgovor (sati)')).toHaveValue('12')
  })

  it('says so when the settings cannot be loaded, and loads again on retry', async () => {
    server.use(
      http.get(`${API}/sales/settings`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = renderScreen(<SalesAiSettings />)
    expect(await screen.findByText('Postavke prodaje nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await form()).toBeInTheDocument()
  })
})
