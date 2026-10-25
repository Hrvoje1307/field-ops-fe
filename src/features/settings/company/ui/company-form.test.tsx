import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { CompanyForm } from './company-form'

const API = 'http://localhost/api/v1'

interface Saved {
  name: string
  oib?: string
  address: string | null
  logoAttachmentId: string | null
  timezone: string
  settings: Record<string, unknown>
}
let puts: Saved[]

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  puts = []
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'PUT' || !request.url.endsWith('/tenant')) return
    void request
      .clone()
      .json()
      .then((body: Saved) => {
        puts.push(body)
      })
  })
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

function renderForm(options: Parameters<typeof userEvent.setup>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CompanyForm />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup(options)
}

const saveButton = () => screen.getByRole('button', { name: 'Spremi postavke' })

describe('CompanyForm', () => {
  it('shows the stored company and settings', async () => {
    renderForm()
    expect(await screen.findByLabelText(/Naziv tvrtke/)).toHaveValue('Alarmko d.o.o.')
    expect(screen.getByLabelText('Naziv pošiljatelja SMS-a')).toHaveValue('ALARMKO')
    expect(screen.getByLabelText('Za završetak naloga traži potpis klijenta')).toBeChecked()
    expect(screen.getByLabelText('Pošalji klijentu SMS kad monter krene prema njemu')).toBeChecked()
    expect(screen.getByLabelText(/Vremenska zona/)).toHaveValue('Europe/Zagreb')
    expect(screen.getByLabelText(/Valuta/)).toHaveValue('EUR')
    expect(screen.getByLabelText('Prefiks broja naloga')).toHaveValue('RN')
  })

  it('can only be saved once something changed, and then sends the whole company', async () => {
    const user = renderForm()
    const name = await screen.findByLabelText(/Naziv tvrtke/)
    expect(saveButton()).toBeDisabled()

    await user.clear(name)
    await user.type(name, 'Alarmko plus d.o.o.')
    await user.click(screen.getByLabelText('Za završetak naloga traži potpis klijenta'))
    await user.click(saveButton())

    expect(await screen.findByText('Postavke su spremljene.')).toBeInTheDocument()
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ name: 'Alarmko plus d.o.o.', timezone: 'Europe/Zagreb' })
    expect(puts[0]?.settings).toMatchObject({
      requireSignature: false,
      smsSenderName: 'ALARMKO',
      jobNumberPrefix: 'RN',
      onTheWaySmsEnabled: true,
    })
    // What was saved is the new starting point
    await waitFor(() => {
      expect(saveButton()).toBeDisabled()
    })
    expect(screen.getByLabelText(/Naziv tvrtke/)).toHaveValue('Alarmko plus d.o.o.')
  })

  it('does not send a company that is not valid, and says what is wrong', async () => {
    const user = renderForm()
    const name = await screen.findByLabelText(/Naziv tvrtke/)
    await user.clear(name)
    await user.type(screen.getByLabelText('OIB'), '123')
    await user.click(saveButton())

    expect(await screen.findByText('Upišite naziv tvrtke.')).toBeInTheDocument()
    expect(screen.getByText('OIB ima 11 znamenki.')).toBeInTheDocument()
    expect(puts).toHaveLength(0)
  })

  it('puts the API’s field error next to its input and keeps what was typed', async () => {
    server.use(
      http.put(`${API}/tenant`, () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Validation',
            errors: { 'settings.smsSenderName': ['Naziv je već zauzet.'] },
          },
          { status: 400 },
        ),
      ),
    )
    const user = renderForm()
    const sender = await screen.findByLabelText('Naziv pošiljatelja SMS-a')
    await user.clear(sender)
    await user.type(sender, 'NOVO')
    await user.click(saveButton())

    expect(await screen.findByText('Naziv je već zauzet.')).toBeInTheDocument()
    expect(sender).toHaveValue('NOVO')
    expect(saveButton()).toBeEnabled()
  })

  it('quiet hours must come as a pair', async () => {
    const user = renderForm()
    await screen.findByLabelText(/Naziv tvrtke/)
    await user.type(screen.getByLabelText('Tiho vrijeme od'), '21:00')
    await user.click(saveButton())
    expect(await screen.findByText('Upišite oba vremena ili nijedno.')).toBeInTheDocument()
    expect(puts).toHaveLength(0)
  })

  it('says so when the company cannot be loaded, and tries again', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/tenant`, () => {
        calls += 1
        return HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 })
      }),
    )
    const user = renderForm()
    expect(await screen.findByText('Podatke o tvrtki nije moguće učitati.')).toBeInTheDocument()
    const before = calls
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    await waitFor(() => {
      expect(calls).toBeGreaterThan(before)
    })
  })
})

describe('the logo', () => {
  const file = (name: string, type: string, size = 12) =>
    new File([new Uint8Array(size)], name, { type })

  it('is uploaded when chosen and linked when the company is saved', async () => {
    const user = renderForm()
    await screen.findByLabelText(/Naziv tvrtke/)
    expect(screen.getByText('Logo nije postavljen.')).toBeInTheDocument()

    await user.upload(screen.getByTestId('logo-input'), file('logo.png', 'image/png'))
    expect(await screen.findByText(/Logo je prenesen/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Logo tvrtke' })).toBeInTheDocument()
    expect(puts).toHaveLength(0)

    await user.click(saveButton())
    await screen.findByText('Postavke su spremljene.')
    expect(puts[0]?.logoAttachmentId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('can be taken away again once it was saved', async () => {
    const user = renderForm()
    await screen.findByLabelText(/Naziv tvrtke/)
    await user.upload(screen.getByTestId('logo-input'), file('logo.png', 'image/png'))
    await screen.findByText(/Logo je prenesen/)
    await user.click(saveButton())
    await screen.findByText('Postavke su spremljene.')
    expect(screen.getByRole('img', { name: 'Logo tvrtke' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ukloni logo' }))
    expect(screen.getByText('Logo nije postavljen.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ukloni logo' })).not.toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() => {
      expect(puts).toHaveLength(2)
    })
    expect(puts[1]?.logoAttachmentId).toBeNull()
  })

  it('refuses a file that is not a picture or is too big, without uploading it', async () => {
    let uploads = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/attachments/upload-url')) uploads += 1
    })
    // The file dialog only offers pictures, but a dropped or renamed file gets here too
    const user = renderForm({ applyAccept: false })
    await screen.findByLabelText(/Naziv tvrtke/)
    const input = screen.getByTestId('logo-input')

    await user.upload(input, file('doc.pdf', 'application/pdf'))
    expect(await screen.findByText(/Odaberite sliku u formatu/)).toBeInTheDocument()
    await user.upload(input, file('big.png', 'image/png', 2 * 1024 * 1024 + 1))
    expect(await screen.findByText('Slika je veća od 2 MB.')).toBeInTheDocument()
    expect(uploads).toBe(0)
    expect(saveButton()).toBeDisabled()
  })

  it('says so when the upload fails, and the company keeps its logo', async () => {
    server.use(
      http.post(`${API}/attachments/upload-url`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = renderForm()
    await screen.findByLabelText(/Naziv tvrtke/)
    await user.upload(screen.getByTestId('logo-input'), file('logo.png', 'image/png'))
    expect(await screen.findByText(/Sliku nije moguće prenijeti/)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })
})
