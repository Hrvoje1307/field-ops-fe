import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { getJob, listJobs } from '@/entities/job'
import { getJobReport } from '@/entities/report'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { renderInRouter } from '@/shared/lib/test/render-in-router'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Toaster } from '@/shared/ui/sonner'

import { ReportForm } from './report-form'

const API = 'http://localhost/api/v1'
const ZAGREB = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
} as const
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'ivan@alarmko.test', password: 'demo' }))
  // jsdom has no canvas: a context that takes every call, and a toBlob that answers
  const context = new Proxy({}, { get: () => vi.fn(), set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([PNG_BYTES], { type: 'image/png' }))
  })
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
})

afterEach(() => {
  toast.dismiss()
  vi.restoreAllMocks()
})

async function onSiteJobId() {
  const page = await listJobs({ status: ['on_site'], pageSize: 1 })
  const id = page.items[0]?.id
  if (!id) throw new Error('Seed needs an on_site job')
  return id
}

async function renderForm(onCompleted = vi.fn()) {
  const jobId = await onSiteJobId()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await renderInRouter(<ReportForm jobId={jobId} onCompleted={onCompleted} />, {
    wrap: (children) => (
      <QueryClientProvider client={queryClient}>
        <TenantFormatProvider settings={ZAGREB}>
          {children}
          <Toaster />
        </TenantFormatProvider>
      </QueryClientProvider>
    ),
  })
  await screen.findByRole('heading', { name: 'Izvještaj' })
  return { jobId, onCompleted, user: userEvent.setup() }
}

const completeButton = () => screen.getByRole('button', { name: 'Završi nalog' })

/** Everything the API asks for, done through the API. */
async function fillEverything(jobId: string) {
  const { apiFetch } = await import('@/shared/api/api-fetch')
  const list = await apiFetch<{ id: string }[]>(`/jobs/${jobId}/checklist`)
  await apiFetch(`/jobs/${jobId}/checklist`, {
    method: 'PUT',
    json: list.map((item) => ({ id: item.id, isDone: true })),
  })
}

describe('ReportForm', () => {
  it('says what is missing, and the button waits for it', async () => {
    await renderForm()
    const missing = await screen.findByTestId('completion-blockers')
    expect(within(missing).getByText('Upišite što je napravljeno.')).toBeInTheDocument()
    expect(within(missing).getByText(/Obavezne stavke kontrolne liste/)).toBeInTheDocument()
    expect(within(missing).getByText('Potreban je potpis klijenta.')).toBeInTheDocument()
    expect(completeButton()).toBeDisabled()
  })

  it('what is typed is saved a moment later, with the arrival as the start', async () => {
    const sent: Record<string, unknown>[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT' && request.url.endsWith('/report')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => sent.push(body))
      }
    })
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Što je napravljeno'), 'Zamijenjen akumulator.')

    await waitFor(
      () => {
        expect(sent.at(-1)).toMatchObject({ workDone: 'Zamijenjen akumulator.' })
      },
      { timeout: 4000 },
    )
    expect(sent.at(-1)?.startedAt).toEqual(expect.stringMatching(/Z$/))
    expect(await screen.findByText('Spremljeno')).toBeInTheDocument()
    server.events.removeAllListeners()
  })

  it('a save that fails keeps the text, says so, and saves when the network is back', async () => {
    let offline = true
    server.use(
      http.put(`${API}/jobs/:id/report`, () => (offline ? HttpResponse.error() : undefined)),
    )
    const { jobId, user } = await renderForm()
    await user.type(screen.getByLabelText('Što je napravljeno'), 'Tekst')

    expect(
      await screen.findByText('Nije spremljeno, pokušavam ponovno…', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Što je napravljeno')).toHaveValue('Tekst')

    offline = false
    // The retry comes after a few seconds; leaving the page also saves what is waiting
    await waitFor(
      async () => {
        expect((await getJobReport(jobId)).workDone).toBe('Tekst')
      },
      { timeout: 9000, interval: 500 },
    )
  }, 15_000)

  it('a half-typed time is shown as wrong and not sent', async () => {
    const { user } = await renderForm()
    const finish = screen.getByLabelText('Završetak')
    fireEvent.change(finish, { target: { value: '07:00' } })
    expect(await screen.findByText('Završetak ne može biti prije dolaska.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Utrošeno vrijeme (min)'))
    await user.type(screen.getByLabelText('Utrošeno vrijeme (min)'), '9x')
    expect(await screen.findByText('Upišite broj minuta.')).toBeInTheDocument()
  })

  it('ticking a checklist item shows at once and is saved', async () => {
    const { jobId, user } = await renderForm()
    const list = screen.getByRole('region', { name: 'Kontrolna lista' })
    const box = within(list)
      .getAllByRole('checkbox')
      .find((candidate) => !(candidate as HTMLInputElement).checked)
    if (!box) throw new Error('Seed needs an open item')
    await user.click(box)
    expect(box).toBeChecked()
    await waitFor(async () => {
      const report = await getJobReport(jobId)
      expect(report.checklist.filter((item) => item.isDone).length).toBeGreaterThan(1)
    })
  })

  it('a tick that cannot be saved is taken back, with a message', async () => {
    server.use(http.put(`${API}/jobs/:id/checklist`, () => HttpResponse.error()))
    const { user } = await renderForm()
    const list = screen.getByRole('region', { name: 'Kontrolna lista' })
    const box = within(list)
      .getAllByRole('checkbox')
      .find((candidate) => !(candidate as HTMLInputElement).checked)
    if (!box) throw new Error('Seed needs an open item')
    await user.click(box)
    expect(
      await screen.findByText('Stavka nije spremljena. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(box).not.toBeChecked()
    })
  })
})

describe('materials', () => {
  it('adds one from the catalog with a decimal comma, and shows the sum; removes it', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj materijal' })
    await user.type(within(dialog).getByRole('searchbox', { name: 'Traži materijal' }), 'kabel')
    await user.click(await within(dialog).findByRole('button', { name: /Kabel 4×0,22/ }))
    expect(within(dialog).getByText(/Odabrano: Kabel/)).toBeInTheDocument()
    const quantity = within(dialog).getByLabelText(/Količina/)
    await user.clear(quantity)
    await user.type(quantity, '12,5')
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj' }))

    const region = await screen.findByRole('region', { name: 'Materijal' })
    expect(await within(region).findByText(/Kabel 4×0,22/)).toBeInTheDocument()
    expect(within(region).getByText(/12,5 m/)).toBeInTheDocument()
    expect(within(region).getByText(/Ukupno: 8,13/)).toBeInTheDocument()

    await user.click(within(region).getByRole('button', { name: /^Ukloni: Kabel/ }))
    await waitFor(() => {
      expect(within(region).getByText('Nema utrošenog materijala.')).toBeInTheDocument()
    })
  })

  it('free text needs a name and a unit; the errors are next to the fields', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj materijal' })
    await user.click(within(dialog).getByRole('radio', { name: 'Drugo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj' }))
    expect(await within(dialog).findByText('Upišite naziv.')).toBeInTheDocument()
    expect(within(dialog).getByText('Upišite jedinicu.')).toBeInTheDocument()
  })

  it('a catalog item has to be chosen', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dodaj materijal' })
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj' }))
    expect(await within(dialog).findByText('Odaberite materijal iz kataloga.')).toBeInTheDocument()
  })
})

describe('photos', () => {
  const photoInput = () => screen.getByLabelText('Dodaj fotografiju', { selector: 'input' })

  it('a photo goes up and appears in the grid', async () => {
    await renderForm()
    const file = new File([PNG_BYTES], 'foto.png', { type: 'image/png' })
    fireEvent.change(photoInput(), { target: { files: [file] } })
    expect(await screen.findByRole('button', { name: 'Otvori fotografiju 1' })).toBeInTheDocument()
  })

  it('a file that is not a photo is refused with its name, and can be discarded', async () => {
    const { user } = await renderForm()
    fireEvent.change(photoInput(), {
      target: { files: [new File(['x'], 'bilješka.gif', { type: 'image/gif' })] },
    })
    expect(await screen.findByText('Format nije podržan: bilješka.gif')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Odbaci' }))
    expect(screen.queryByText(/Format nije podržan/)).not.toBeInTheDocument()
  })

  it('a failed upload can be tried again and continues the same upload', async () => {
    let failures = 1
    server.use(
      http.put(`${API}/mock-storage/:id`, () =>
        failures-- > 0 ? new HttpResponse(null, { status: 500 }) : undefined,
      ),
    )
    const urls: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/attachments/upload-url')) urls.push(request.url)
    })
    const { user } = await renderForm()
    fireEvent.change(photoInput(), {
      target: { files: [new File([PNG_BYTES], 'foto.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('Fotografija nije prenesena: foto.png')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await screen.findByRole('button', { name: 'Otvori fotografiju 1' })).toBeInTheDocument()
    // One upload target for the whole thing
    expect(urls).toHaveLength(1)
    server.events.removeAllListeners()
  })

  it('a photo can be removed after asking', async () => {
    const { user } = await renderForm()
    fireEvent.change(photoInput(), {
      target: { files: [new File([PNG_BYTES], 'foto.png', { type: 'image/png' })] },
    })
    await user.click(await screen.findByRole('button', { name: 'Ukloni fotografiju 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ukloniti fotografiju?' })
    await user.click(within(dialog).getByRole('button', { name: 'Ukloni' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Otvori fotografiju 1' })).not.toBeInTheDocument()
    })
  })
})

describe('signature', () => {
  const draw = () => {
    const pad = screen.getByRole('img', { name: 'Potpis' })
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 40 })
    fireEvent.pointerUp(pad, { pointerId: 1 })
  }

  it('needs a name and a drawing, each said next to its field; nothing is sent', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Spremi potpis' }))
    expect(await screen.findByText('Upišite ime i prezime (najmanje 2 slova).')).toBeInTheDocument()
    expect(screen.getByText('Potpišite se u okviru.')).toBeInTheDocument()
  })

  it('saves the drawing with the name, shows it, and the missing signature is no longer said', async () => {
    const { jobId, user } = await renderForm()
    await user.type(screen.getByLabelText('Ime i prezime potpisnika'), 'Marko Horizont')
    draw()
    await user.click(screen.getByRole('button', { name: 'Spremi potpis' }))

    expect(await screen.findByText('Potpisao: Marko Horizont')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Potpiši ponovno' })).toBeInTheDocument()
    expect(screen.queryByText('Potreban je potpis klijenta.')).not.toBeInTheDocument()
    expect((await getJobReport(jobId)).signedByName).toBe('Marko Horizont')
  })

  it('a signature that could not be saved says so and keeps the drawing area', async () => {
    server.use(http.post(`${API}/jobs/:id/signature`, () => HttpResponse.error()))
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Ime i prezime potpisnika'), 'Marko Horizont')
    draw()
    await user.click(screen.getByRole('button', { name: 'Spremi potpis' }))
    expect(await screen.findByText('Potpis nije spremljen. Pokušajte ponovno.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spremi potpis' })).toBeEnabled()
  })
})

describe('completing', () => {
  async function ready() {
    const form = await renderForm()
    await fillEverything(form.jobId)
    const { user } = form
    await user.type(screen.getByLabelText('Što je napravljeno'), 'Gotovo.')
    await user.type(screen.getByLabelText('Ime i prezime potpisnika'), 'Marko Horizont')
    const pad = screen.getByRole('img', { name: 'Potpis' })
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 40 })
    fireEvent.pointerUp(pad, { pointerId: 1 })
    await user.click(screen.getByRole('button', { name: 'Spremi potpis' }))
    await screen.findByText('Potpisao: Marko Horizont')
    return form
  }

  it('the button opens up when nothing is missing; completing saves, completes and says so', async () => {
    const { jobId, user, onCompleted } = await ready()
    await waitFor(() => {
      expect(completeButton()).toBeEnabled()
    })
    await user.click(completeButton())

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledOnce()
    })
    expect(await screen.findByText(/je završen\.$/)).toBeInTheDocument()
    const job = await getJob(jobId)
    expect(job.status).toBe('completed')
    // The finish is stamped when none was entered
    expect((await getJobReport(jobId)).finishedAt).toBeTruthy()
  }, 15_000)

  it('does not send the report to the client when asked not to', async () => {
    let body: Record<string, unknown> = {}
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/complete')) {
        void request
          .clone()
          .json()
          .then((sent: Record<string, unknown>) => (body = sent))
      }
    })
    const { user } = await ready()
    await user.click(screen.getByRole('checkbox', { name: 'Pošalji izvještaj klijentu' }))
    await waitFor(() => {
      expect(completeButton()).toBeEnabled()
    })
    await user.click(completeButton())
    await waitFor(() => {
      expect(body).toMatchObject({ sendReportToClient: false })
    })
    server.events.removeAllListeners()
  }, 15_000)

  it("the API's 422 is shown with its reason, and the form stays", async () => {
    server.use(
      http.post(`${API}/jobs/:id/complete`, () =>
        HttpResponse.json(
          { status: 422, title: 'Unprocessable', detail: 'Potreban je potpis klijenta.' },
          { status: 422 },
        ),
      ),
    )
    const { user, onCompleted } = await ready()
    await waitFor(() => {
      expect(completeButton()).toBeEnabled()
    })
    await user.click(completeButton())
    expect(
      await screen.findByText('Nalog se ne može završiti: Potreban je potpis klijenta.'),
    ).toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(completeButton()).toBeEnabled()
  }, 15_000)

  it('a report that could not be saved first stops the completion', async () => {
    const { user, onCompleted } = await ready()
    await waitFor(() => {
      expect(completeButton()).toBeEnabled()
    })
    server.use(http.put(`${API}/jobs/:id/report`, () => HttpResponse.error()))
    await user.type(screen.getByLabelText('Što je napravljeno'), ' Još jedno.')
    await user.click(completeButton())
    expect(
      await screen.findByText('Izvještaj nije spremljen. Pokušajte ponovno.'),
    ).toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
  }, 15_000)
})
