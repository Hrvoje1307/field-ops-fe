import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listSkills } from '@/entities/skill'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { SkillsSettings } from './skills-settings'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
  sessionStore.setTokens(await login({ email: 'vlasnik@alarmko.test', password: 'demo' }))
})

afterEach(() => {
  toast.dismiss()
})

function renderSkills() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SkillsSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis vještina' })

describe('SkillsSettings', () => {
  it('lists the tenant’s skills', async () => {
    renderSkills()
    const skills = await listSkills()
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(skills.length)
    expect(rows[0]).toHaveTextContent(skills[0]?.name ?? '')
  })

  it('adds a skill, which then shows in the list', async () => {
    const user = renderSkills()
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj vještinu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova vještina' })
    await user.type(within(dialog).getByLabelText(/Naziv/), 'Zavarivanje')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Vještina je spremljena.')).toBeInTheDocument()
    expect(await within(await list()).findByText('Zavarivanje')).toBeInTheDocument()
    expect((await listSkills()).map((skill) => skill.name)).toContain('Zavarivanje')
  })

  it('needs a name, and does not send without one', async () => {
    const user = renderSkills()
    await list()
    const before = (await listSkills()).length
    await user.click(screen.getByRole('button', { name: 'Dodaj vještinu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova vještina' })
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(dialog).findByText('Upišite naziv vještine.')).toBeInTheDocument()
    expect(await listSkills()).toHaveLength(before)
  })

  it('says a name is taken, next to the name, and keeps the panel open', async () => {
    const user = renderSkills()
    const [first] = await listSkills()
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj vještinu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova vještina' })
    await user.type(within(dialog).getByLabelText(/Naziv/), first?.name ?? '')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(
      await within(dialog).findByText('Vještina s tim nazivom već postoji.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nova vještina' })).toBeInTheDocument()
  })

  it('renames a skill', async () => {
    const user = renderSkills()
    const [first] = await listSkills()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${first?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi vještinu' })
    const name = within(dialog).getByLabelText(/Naziv/)
    expect(name).toHaveValue(first?.name)
    await user.clear(name)
    await user.type(name, 'Preimenovana')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await within(await list()).findByText('Preimenovana')).toBeInTheDocument()
    expect((await listSkills()).find((skill) => skill.id === first?.id)?.name).toBe('Preimenovana')
  })

  it('asks before deleting, and deletes', async () => {
    const user = renderSkills()
    const skills = await listSkills()
    const target = skills[0]
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${target?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati vještinu?' })
    expect(dialog).toHaveTextContent(target?.name ?? '')
    // Nothing is gone before it is confirmed
    expect(await listSkills()).toHaveLength(skills.length)
    await user.click(within(dialog).getByRole('button', { name: 'Obriši vještinu' }))
    await waitFor(async () => {
      expect(await listSkills()).toHaveLength(skills.length - 1)
    })
    expect(await screen.findByText(/je obrisana\./)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('says so when deleting fails, and keeps the dialog', async () => {
    server.use(
      http.delete(`${API}/skills/:id`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = renderSkills()
    const [first] = await listSkills()
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${first?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati vještinu?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši vještinu' }))
    expect(
      await within(dialog).findByText('Vještinu nije moguće obrisati. Pokušajte ponovno.'),
    ).toBeInTheDocument()
  })

  it('says so when the skills cannot be loaded, and tries again', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/skills`, () => {
        calls += 1
        return HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 })
      }),
    )
    const user = renderSkills()
    expect(await screen.findByText('Vještine nije moguće učitati.')).toBeInTheDocument()
    const before = calls
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    await waitFor(() => {
      expect(calls).toBeGreaterThan(before)
    })
  })

  it('says when there are none', async () => {
    server.use(http.get(`${API}/skills`, () => HttpResponse.json([])))
    renderSkills()
    expect(await screen.findByText('Još nema vještina.')).toBeInTheDocument()
  })
})
