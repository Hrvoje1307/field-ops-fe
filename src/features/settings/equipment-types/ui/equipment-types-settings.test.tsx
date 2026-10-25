import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listAssetTypes } from '@/entities/asset'
import { login, sessionStore } from '@/entities/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { EquipmentTypesSettings } from './equipment-types-settings'

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

function renderTypes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EquipmentTypesSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis vrsta opreme' })

async function addType(user: ReturnType<typeof userEvent.setup>, name: string, icon = '') {
  await list()
  await user.click(screen.getByRole('button', { name: 'Dodaj vrstu opreme' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova vrsta opreme' })
  await user.type(within(dialog).getByLabelText(/Naziv/), name)
  if (icon) await user.type(within(dialog).getByLabelText('Ikona'), icon)
  await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
  await screen.findByText('Vrsta opreme je spremljena.')
}

describe('EquipmentTypesSettings', () => {
  it('lists the tenant’s equipment types', async () => {
    renderTypes()
    const types = await listAssetTypes()
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(types.length)
    expect(rows[0]).toHaveTextContent(types[0]?.name ?? '')
  })

  it('adds a type with an icon', async () => {
    const user = renderTypes()
    await addType(user, 'Bojler', 'flame')
    expect(await within(await list()).findByText('Bojler')).toBeInTheDocument()
    expect((await listAssetTypes()).find((type) => type.name === 'Bojler')?.icon).toBe('flame')
  })

  it('needs a name', async () => {
    const user = renderTypes()
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj vrstu opreme' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova vrsta opreme' })
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Upišite naziv vrste opreme.')).toBeInTheDocument()
  })

  it('renaming a type keeps its icon', async () => {
    const user = renderTypes()
    const [type] = await listAssetTypes()
    expect(type?.icon).toBeTruthy()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${type?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi vrstu opreme' })
    expect(within(dialog).getByLabelText('Ikona')).toHaveValue(type?.icon)
    const name = within(dialog).getByLabelText(/Naziv/)
    await user.clear(name)
    await user.type(name, 'Drugi naziv')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Vrsta opreme je spremljena.')
    expect((await listAssetTypes()).find((t) => t.id === type?.id)).toMatchObject({
      name: 'Drugi naziv',
      icon: type?.icon,
    })
  })

  it('refuses to delete a type that equipment has, and says why', async () => {
    const user = renderTypes()
    const [type] = await listAssetTypes()
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${type?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati vrstu opreme?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši vrstu' }))
    expect(await within(dialog).findByText(/Oprema te vrste još postoji/)).toBeVisible()
  })

  it('deletes a type nobody uses', async () => {
    const user = renderTypes()
    await addType(user, 'Privremena')
    await user.click(await screen.findByRole('button', { name: 'Obriši: Privremena' }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati vrstu opreme?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši vrstu' }))
    await waitFor(() => {
      expect(screen.queryByText('Privremena')).not.toBeInTheDocument()
    })
    expect((await listAssetTypes()).map((type) => type.name)).not.toContain('Privremena')
  })
})
