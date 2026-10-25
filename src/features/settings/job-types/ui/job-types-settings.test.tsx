import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listChecklistTemplates } from '@/entities/checklist-template'
import { login, sessionStore } from '@/entities/auth'
import { listJobTypes } from '@/entities/job-type'
import { listSkills } from '@/entities/skill'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { JobTypesSettings } from './job-types-settings'

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

function renderTypes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <JobTypesSettings />
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const list = () => screen.findByRole('list', { name: 'Popis vrsta naloga' })

type User = ReturnType<typeof userEvent.setup>

async function addType(user: User, name: string) {
  await list()
  await user.click(screen.getByRole('button', { name: 'Dodaj vrstu naloga' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova vrsta naloga' })
  await user.type(within(dialog).getByLabelText(/Naziv/), name)
  return dialog
}

describe('JobTypesSettings', () => {
  it('lists the job types with duration, crew, skills and checklist', async () => {
    renderTypes()
    const [types, skills, templates] = await Promise.all([
      listJobTypes(),
      listSkills(),
      listChecklistTemplates(),
    ])
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(types.length)
    // One with a checklist and a skill, if the seed has it
    const rich = types.find((type) => type.checklistTemplateId && type.requiredSkillIds.length > 0)
    if (!rich) throw new Error('Seed needs a job type with a checklist and a skill')
    const row = rows[types.indexOf(rich)]
    expect(row).toHaveTextContent(rich.name)
    await waitFor(() => {
      expect(row).toHaveTextContent(
        `Lista: ${templates.find((t) => t.id === rich.checklistTemplateId)?.name ?? ''}`,
      )
    })
    expect(row).toHaveTextContent(skills.find((s) => s.id === rich.requiredSkillIds[0])?.name ?? '')
  })

  it('adds a job type: defaults, skills, checklist, colour', async () => {
    let sent: Record<string, unknown> | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/job-types')) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => {
            sent = body
          })
      }
    })
    const user = renderTypes()
    const [skills, templates] = await Promise.all([listSkills(), listChecklistTemplates()])
    const dialog = await addType(user, 'Zamjena dijela')

    const duration = within(dialog).getByLabelText(/Uobičajeno trajanje/)
    expect(duration).toHaveValue(60)
    await user.clear(duration)
    await user.type(duration, '45')
    await user.click(await within(dialog).findByLabelText(skills[0]?.name ?? ''))
    await user.selectOptions(
      within(dialog).getByLabelText('Kontrolna lista'),
      templates[0]?.name ?? '',
    )
    const color = within(dialog).getByLabelText(/^Boja/)
    await user.clear(color)
    await user.type(color, '#AA0000')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))

    expect(await screen.findByText('Vrsta naloga je spremljena.')).toBeInTheDocument()
    expect(await within(await list()).findByText('Zamjena dijela')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent).toEqual({
        name: 'Zamjena dijela',
        color: '#aa0000',
        defaultDurationMin: 45,
        requiredPeople: 1,
        requiredSkillIds: [skills[0]?.id],
        checklistTemplateId: templates[0]?.id,
        smsEnabled: true,
        isActive: true,
      })
    })
  })

  it('the picker and the code are one colour', async () => {
    const user = renderTypes()
    const dialog = await addType(user, 'Boja')
    const code = within(dialog).getByLabelText(/^Boja/)
    const picker = within(dialog).getByLabelText('Odaberi boju')
    expect(code).toHaveValue('#2563eb')
    expect(picker).toHaveValue('#2563eb')
    await user.clear(code)
    await user.type(code, '#112233')
    expect(picker).toHaveValue('#112233')
  })

  it('does not send a job type that is not valid, and says what is wrong', async () => {
    const user = renderTypes()
    const before = (await listJobTypes()).length
    const dialog = await addType(user, 'Prekratko')
    const duration = within(dialog).getByLabelText(/Uobičajeno trajanje/)
    await user.clear(duration)
    await user.type(duration, '2')
    const color = within(dialog).getByLabelText(/^Boja/)
    await user.clear(color)
    await user.type(color, 'plava')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(
      await within(dialog).findByText('Trajanje je cijeli broj minuta, najmanje 5.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Upišite boju kao #rrggbb.')).toBeInTheDocument()
    expect(await listJobTypes()).toHaveLength(before)
  })

  it('opens a job type with its values, and deactivating it shows on the row', async () => {
    const user = renderTypes()
    const [type] = await listJobTypes()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${type?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi vrstu naloga' })
    expect(within(dialog).getByLabelText(/Naziv/)).toHaveValue(type?.name)
    expect(within(dialog).getByLabelText(/Uobičajeno trajanje/)).toHaveValue(
      type?.defaultDurationMin,
    )
    const active = within(dialog).getByLabelText(/Aktivna/)
    expect(active).toBeChecked()
    await user.click(active)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Vrsta naloga je spremljena.')
    expect(await within(await list()).findByText('Neaktivna')).toBeInTheDocument()
    expect((await listJobTypes()).find((t) => t.id === type?.id)?.isActive).toBe(false)
  })

  it('a skill that was chosen stays chosen, and one can be taken away', async () => {
    const user = renderTypes()
    const [types, skills] = await Promise.all([listJobTypes(), listSkills()])
    const type = types.find((t) => t.requiredSkillIds.length > 0)
    const skill = skills.find((s) => s.id === type?.requiredSkillIds[0])
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${type?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi vrstu naloga' })
    const box = await within(dialog).findByLabelText(skill?.name ?? '')
    expect(box).toBeChecked()
    await user.click(box)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Vrsta naloga je spremljena.')
    const saved = (await listJobTypes()).find((t) => t.id === type?.id)
    expect(saved?.requiredSkillIds).not.toContain(skill?.id)
  })

  it('a required skill the tenant no longer has is dropped when the type is saved', async () => {
    // A backend that leaves the id on the job type after the skill is gone
    const [types, skills] = await Promise.all([listJobTypes(), listSkills()])
    const type = types[0]
    if (!type) throw new Error('Seed needs job types')
    const gone = '00000000-0000-4000-8000-000000000000'
    const kept = skills[0]?.id ?? ''
    server.use(
      http.get(`${API}/job-types`, () =>
        HttpResponse.json([{ ...type, requiredSkillIds: [kept, gone] }, ...types.slice(1)]),
      ),
    )
    let sent: { requiredSkillIds: string[] } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') {
        void request
          .clone()
          .json()
          .then((body: { requiredSkillIds: string[] }) => {
            sent = body
          })
      }
    })

    const user = renderTypes()
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${type.name}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi vrstu naloga' })
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Vrsta naloga je spremljena.')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent?.requiredSkillIds).toEqual([kept])
    })
  })

  it('refuses to delete a type that has jobs, and points to deactivating it', async () => {
    const user = renderTypes()
    const [type] = await listJobTypes()
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${type?.name ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati vrstu naloga?' })
    await user.click(within(dialog).getByRole('button', { name: 'Obriši vrstu' }))
    expect(await within(dialog).findByText(/isključite „Aktivna”/)).toBeVisible()
  })

  it('deletes a type nobody uses', async () => {
    const user = renderTypes()
    const dialog = await addType(user, 'Privremena')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await within(await list()).findByText('Privremena')
    await user.click(screen.getByRole('button', { name: 'Obriši: Privremena' }))
    const confirm = await screen.findByRole('dialog', { name: 'Obrisati vrstu naloga?' })
    await user.click(within(confirm).getByRole('button', { name: 'Obriši vrstu' }))
    await waitFor(() => {
      expect(screen.queryByText('Privremena')).not.toBeInTheDocument()
    })
  })

  it('says so when the job types cannot be loaded', async () => {
    server.use(
      http.get(`${API}/job-types`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderTypes()
    expect(await screen.findByText('Vrste naloga nije moguće učitati.')).toBeInTheDocument()
  })
})
