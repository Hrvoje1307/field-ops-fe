import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listAssetTypes } from '@/entities/asset'
import { login, sessionStore } from '@/entities/auth'
import { type CustomFieldEntity, listEntityCustomFields } from '@/entities/custom-field'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { CustomFieldsSettings } from './custom-fields-settings'

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

function Harness({ initial }: { initial: CustomFieldEntity }) {
  const [entity, setEntity] = useState(initial)
  return <CustomFieldsSettings entity={entity} onEntityChange={setEntity} />
}

function renderFields(initial: CustomFieldEntity = 'job') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis polja' })
const labels = async () =>
  within(await list())
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent ?? '')

type User = ReturnType<typeof userEvent.setup>

async function openNew(user: User) {
  await list()
  await user.click(screen.getByRole('button', { name: 'Dodaj polje' }))
  return screen.findByRole('dialog', { name: 'Novo polje' })
}

describe('CustomFieldsSettings', () => {
  it('lists the fields of the record kind, in order, and switches kind', async () => {
    const user = renderFields('job')
    const jobFields = await listEntityCustomFields('job')
    expect(jobFields.length).toBeGreaterThan(0)
    const shown = await labels()
    expect(shown).toHaveLength(jobFields.length)
    expect(shown[0]).toContain(jobFields[0]?.label)

    await user.click(screen.getByRole('button', { name: 'Klijent' }))
    const clientFields = await listEntityCustomFields('client')
    await waitFor(async () => {
      expect(await labels()).toHaveLength(clientFields.length)
    })
    expect(screen.getByRole('button', { name: 'Klijent' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nalog' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('adds a field: the key follows the label, the order goes last', async () => {
    let sent: Record<string, unknown> | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/custom-fields')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body
          })
      }
    })
    const user = renderFields('job')
    const before = await listEntityCustomFields('job')
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Šifra čuvara')
    expect(within(dialog).getByLabelText(/Ključ/)).toHaveValue('sifra_cuvara')
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta polja/), 'Broj')
    await user.click(within(dialog).getByLabelText('Obavezno polje'))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Polje je spremljeno.')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent).toMatchObject({
        entity: 'job',
        key: 'sifra_cuvara',
        label: 'Šifra čuvara',
        type: 'number',
        required: true,
        isSensitive: false,
        options: null,
        assetTypeId: null,
        sortOrder: Math.max(...before.map((field) => field.sortOrder)) + 10,
      })
    })
    expect((await labels()).at(-1)).toContain('Šifra čuvara')
  })

  it('a key typed by hand is not overwritten by the label', async () => {
    const user = renderFields('job')
    const dialog = await openNew(user)
    const key = within(dialog).getByLabelText(/Ključ/)
    await user.type(key, 'moj_kljuc')
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Nešto drugo')
    expect(key).toHaveValue('moj_kljuc')
  })

  it('a select field needs options; new ones get a stored value from their name', async () => {
    let sent: { options?: { value: string; label: string }[] | null } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/custom-fields')) {
        void request
          .clone()
          .json()
          .then((body: typeof sent) => {
            sent = body
          })
      }
    })
    const user = renderFields('job')
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Način plaćanja')
    await user.selectOptions(within(dialog).getByLabelText(/Vrsta polja/), 'Jedan odabir')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Dodajte barem jednu opciju.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Dodaj opciju' }))
    await user.type(within(dialog).getByLabelText('Opcija 1'), 'Gotovina')
    await user.click(within(dialog).getByRole('button', { name: 'Dodaj opciju' }))
    await user.type(within(dialog).getByLabelText('Opcija 2'), 'Kartica')
    await user.click(within(dialog).getByRole('button', { name: 'Pomakni opciju 2 gore' }))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Polje je spremljeno.')
    await waitFor(() => {
      expect(sent?.options).toEqual([
        { value: 'kartica', label: 'Kartica' },
        { value: 'gotovina', label: 'Gotovina' },
      ])
    })
  })

  it('a key that exists is refused next to the key', async () => {
    const user = renderFields('job')
    const [existing] = await listEntityCustomFields('job')
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Isti ključ')
    const key = within(dialog).getByLabelText(/Ključ/)
    await user.clear(key)
    await user.type(key, existing?.key ?? '')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Polje s tim ključem već postoji.')).toBeInTheDocument()
  })

  it('an invalid key is not sent', async () => {
    const user = renderFields('job')
    const before = (await listEntityCustomFields('job')).length
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Loš ključ')
    const key = within(dialog).getByLabelText(/Ključ/)
    await user.clear(key)
    await user.type(key, 'Loš-Ključ')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText(/Ključ počinje malim slovom/)).toBeInTheDocument()
    expect(await listEntityCustomFields('job')).toHaveLength(before)
  })

  it('opens a field with the key and type locked, and saves a new label', async () => {
    const user = renderFields('job')
    const [field] = await listEntityCustomFields('job')
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${field?.label ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi polje' })
    expect(within(dialog).getByLabelText(/Ključ/)).toBeDisabled()
    expect(within(dialog).getByLabelText(/Ključ/)).toHaveValue(field?.key)
    expect(within(dialog).getByLabelText(/Vrsta polja/)).toBeDisabled()
    const label = within(dialog).getByLabelText(/Naziv polja/)
    await user.clear(label)
    await user.type(label, 'Novi naziv')
    // The key does not follow when editing
    expect(within(dialog).getByLabelText(/Ključ/)).toHaveValue(field?.key)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Polje je spremljeno.')
    const saved = (await listEntityCustomFields('job')).find((f) => f.id === field?.id)
    expect(saved).toMatchObject({ label: 'Novi naziv', key: field?.key, type: field?.type })
    expect(saved?.sortOrder).toBe(field?.sortOrder)
  })

  it('puts a field up or down', async () => {
    const user = renderFields('job')
    const before = await listEntityCustomFields('job')
    expect(before.length).toBeGreaterThan(1)
    await list()
    expect(
      screen.getByRole('button', { name: `Pomakni gore: ${before[0]?.label ?? ''}` }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: `Pomakni dolje: ${before[0]?.label ?? ''}` }),
    )
    await waitFor(async () => {
      const shown = await labels()
      expect(shown[0]).toContain(before[1]?.label)
      expect(shown[1]).toContain(before[0]?.label)
    })
    const after = await listEntityCustomFields('job')
    expect(after.map((f) => f.id).slice(0, 2)).toEqual([before[1]?.id, before[0]?.id])
  })

  it('equipment fields can belong to one equipment type', async () => {
    const user = renderFields('asset')
    const types = await listAssetTypes()
    const dialog = await openNew(user)
    await user.type(within(dialog).getByLabelText(/Naziv polja/), 'Garancija do')
    await user.selectOptions(within(dialog).getByLabelText('Vrsta opreme'), types[0]?.name ?? '')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Polje je spremljeno.')
    const saved = (await listEntityCustomFields('asset')).find((f) => f.key === 'garancija_do')
    expect(saved?.assetTypeId).toBe(types[0]?.id)
    expect(await list()).toHaveTextContent(`Vrsta opreme: ${types[0]?.name ?? ''}`)
  })

  it('asks before deleting, and says the values stay', async () => {
    const user = renderFields('job')
    const before = await listEntityCustomFields('job')
    const target = before[0]
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${target?.label ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati polje?' })
    expect(dialog).toHaveTextContent('ostaju spremljene, ali skrivene')
    expect(await listEntityCustomFields('job')).toHaveLength(before.length)
    await user.click(within(dialog).getByRole('button', { name: 'Obriši polje' }))
    await waitFor(async () => {
      expect(await listEntityCustomFields('job')).toHaveLength(before.length - 1)
    })
  })

  it('says so when the fields cannot be loaded, and when there are none', async () => {
    server.use(
      http.get(`${API}/custom-fields`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderFields('job')
    expect(await screen.findByText('Dodatna polja nije moguće učitati.')).toBeInTheDocument()
  })

  it('says when a kind has no fields', async () => {
    server.use(http.get(`${API}/custom-fields`, () => HttpResponse.json([])))
    renderFields('job')
    expect(await screen.findByText('Još nema dodatnih polja.')).toBeInTheDocument()
  })
})

describe('equipment fields with the same label', () => {
  it('are told apart by their equipment type in the names of their buttons', async () => {
    const types = await listAssetTypes()
    const field = (n: number, assetTypeId: string | null) => ({
      id: `00000000-0000-4000-8000-00000000000${String(n)}`,
      entity: 'asset',
      assetTypeId,
      key: 'oznaka',
      label: 'Oznaka',
      type: 'text',
      options: null,
      required: false,
      isSensitive: false,
      sortOrder: n * 10,
    })
    server.use(
      http.get(`${API}/custom-fields`, () =>
        HttpResponse.json([
          field(1, types[0]?.id ?? null),
          field(2, types[1]?.id ?? null),
          field(3, null),
        ]),
      ),
    )
    renderFields('asset')
    await list()
    expect(
      await screen.findByRole('button', { name: `Uredi: Oznaka (${types[0]?.name ?? ''})` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Uredi: Oznaka (${types[1]?.name ?? ''})` }),
    ).toBeInTheDocument()
    // One for every type needs no suffix
    expect(screen.getByRole('button', { name: 'Uredi: Oznaka' })).toBeInTheDocument()
    expect(await list()).toHaveTextContent('sve vrste opreme')
  })
})
