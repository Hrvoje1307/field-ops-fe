import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { login, sessionStore } from '@/entities/auth'
import { listInvitations, listMembers } from '@/entities/member'
import {
  listTechnicians,
  technicianFormValues,
  toTechnicianBody,
  updateTechnician,
} from '@/entities/technician'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { TeamSettings } from './team-settings'

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

function renderTeam() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <TeamSettings />
      </Suspense>
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

type User = ReturnType<typeof userEvent.setup>

const members = () => screen.findByRole('list', { name: 'Popis članova' })
const invitations = () => screen.findByRole('list', { name: 'Popis pozivnica' })
const rowOf = async (name: string) => {
  const rows = within(await members()).getAllByRole('listitem')
  const row = rows.find((candidate) => candidate.querySelector('p')?.textContent.startsWith(name))
  if (!row) throw new Error(`No member row for ${name}`)
  return row
}

describe('members', () => {
  it('lists everyone with their role, marks yourself, and shows a technician’s working data', async () => {
    renderTeam()
    const all = await listMembers()
    const rows = within(await members()).getAllByRole('listitem')
    expect(rows).toHaveLength(all.length)

    const owner = all.find((m) => m.email === 'vlasnik@alarmko.test')
    const ownerRow = await rowOf(owner?.fullName ?? '')
    expect(ownerRow).toHaveTextContent('(vi)')
    expect(ownerRow).toHaveTextContent('Vlasnik')

    const [technician] = await listTechnicians({})
    const technicianRow = await rowOf(technician?.fullName ?? '')
    expect(technicianRow).toHaveTextContent('Monter')
    await waitFor(() => {
      expect(technicianRow).toHaveTextContent(
        `${technician?.workStart ?? ''}–${technician?.workEnd ?? ''}`,
      )
    })
    expect(technicianRow).toHaveTextContent('pon–pet')
  })

  it('your own role and status are not yours to change', async () => {
    const user = renderTeam()
    const owner = (await listMembers()).find((m) => m.email === 'vlasnik@alarmko.test')
    await members()
    await user.click(screen.getByRole('button', { name: `Uredi člana: ${owner?.fullName ?? ''}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Uredi člana' })
    expect(within(dialog).getByText(/ne možete mijenjati/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Uloga')).toBeDisabled()
    expect(within(dialog).getByLabelText(/Aktivan/)).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Spremi' })).toBeDisabled()
  })

  it('changes a member’s role and whether they can sign in', async () => {
    const user = renderTeam()
    const dispatcher = (await listMembers()).find((m) => m.email === 'dispecer@alarmko.test')
    await members()
    await user.click(
      screen.getByRole('button', { name: `Uredi člana: ${dispatcher?.fullName ?? ''}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Uredi člana' })
    // Nothing to save until something changes
    expect(within(dialog).getByRole('button', { name: 'Spremi' })).toBeDisabled()
    await user.click(within(dialog).getByLabelText(/Aktivan/))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Član je spremljen.')).toBeInTheDocument()
    const saved = (await listMembers()).find((m) => m.userId === dispatcher?.userId)
    expect(saved).toMatchObject({ isActive: false, role: 'dispatcher' })
    expect(await rowOf(dispatcher?.fullName ?? '')).toHaveTextContent('Neaktivan')
  })

  it('says why when the last owner would be lost (409) and keeps the panel', async () => {
    server.use(
      http.put(`${API}/users/:id`, () =>
        HttpResponse.json({ status: 409, title: 'Last owner' }, { status: 409 }),
      ),
    )
    const user = renderTeam()
    const dispatcher = (await listMembers()).find((m) => m.email === 'dispecer@alarmko.test')
    await members()
    await user.click(
      screen.getByRole('button', { name: `Uredi člana: ${dispatcher?.fullName ?? ''}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Uredi člana' })
    await user.selectOptions(within(dialog).getByLabelText('Uloga'), 'Dispečer')
    await user.click(within(dialog).getByLabelText(/Aktivan/))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(
      await within(dialog).findByText('Tvrtka mora imati barem jednog aktivnog vlasnika.'),
    ).toBeInTheDocument()
  })

  it('says so when the members cannot be loaded', async () => {
    server.use(
      http.get(`${API}/users`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderTeam()
    expect(await screen.findByText('Članove nije moguće učitati.')).toBeInTheDocument()
  })
})

describe('technician data', () => {
  it('opens with what the technician has and saves a change as a replace', async () => {
    let sent: { workingDays: number[]; skillIds: string[]; workEnd: string } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT' && /\/technicians\/[^/]+$/.test(request.url)) {
        void request
          .clone()
          .json()
          .then((body: typeof sent) => {
            sent = body
          })
      }
    })
    const user = renderTeam()
    const [technician] = await listTechnicians({})
    if (!technician) throw new Error('Seed needs technicians')
    await members()
    await user.click(
      screen.getByRole('button', { name: `Podaci o monteru: ${technician.fullName}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Podaci o monteru' })
    expect(within(dialog).getByLabelText(/Radi do/)).toHaveValue(technician.workEnd)
    expect(within(dialog).getByLabelText('ponedjeljak')).toBeChecked()
    expect(within(dialog).getByLabelText('subota')).not.toBeChecked()

    await user.click(within(dialog).getByLabelText('subota'))
    const end = within(dialog).getByLabelText(/Radi do/)
    await user.clear(end)
    await user.type(end, '20:00')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Podaci o monteru su spremljeni.')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent?.workEnd).toBe('20:00')
    })
    expect(sent?.workingDays).toEqual([...technician.workingDays, 6].sort((a, b) => a - b))
    expect(sent?.skillIds).toEqual(technician.skillIds)
  })

  it('does not send hours the wrong way round or no working day, and says so', async () => {
    const user = renderTeam()
    const [technician] = await listTechnicians({})
    if (!technician) throw new Error('Seed needs technicians')
    await members()
    await user.click(
      screen.getByRole('button', { name: `Podaci o monteru: ${technician.fullName}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Podaci o monteru' })
    const start = within(dialog).getByLabelText(/Radi od/)
    await user.clear(start)
    await user.type(start, '23:00')
    for (const day of technician.workingDays) {
      const label = ['ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota', 'nedjelja'][
        day - 1
      ]
      await user.click(within(dialog).getByLabelText(label ?? ''))
    }
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(
      await within(dialog).findByText('Kraj radnog vremena mora biti nakon početka.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Odaberite barem jedan radni dan.')).toBeInTheDocument()
  })

  it('a member who becomes a technician is given working data', async () => {
    let created: { userId: string } | undefined
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/technicians')) {
        void request
          .clone()
          .json()
          .then((body: typeof created) => {
            created = body
          })
      }
    })
    const user = renderTeam()
    const dispatcher = (await listMembers()).find((m) => m.email === 'dispecer@alarmko.test')
    if (!dispatcher) throw new Error('Seed needs a dispatcher')
    await members()
    // First the role…
    await user.click(screen.getByRole('button', { name: `Uredi člana: ${dispatcher.fullName}` }))
    const member = await screen.findByRole('dialog', { name: 'Uredi člana' })
    await user.selectOptions(within(member).getByLabelText('Uloga'), 'Monter')
    await user.click(within(member).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Član je spremljen.')

    // …then the working data
    const row = await rowOf(dispatcher.fullName)
    expect(row).toHaveTextContent('bez podataka o monteru')
    await user.click(
      screen.getByRole('button', { name: `Dodaj podatke o monteru: ${dispatcher.fullName}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Podaci o monteru' })
    expect(within(dialog).getByLabelText(/Radi od/)).toHaveValue('08:00')
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Podaci o monteru su spremljeni.')
    expect(created?.userId).toBe(dispatcher.userId)
    await waitFor(async () => {
      expect(
        (await listMembers()).find((m) => m.userId === dispatcher.userId)?.technicianId,
      ).toBeTruthy()
    })
    await waitFor(async () => {
      expect(await rowOf(dispatcher.fullName)).toHaveTextContent('08:00–16:00')
    })
  })

  it('a technician who is switched off keeps their data and can still be opened', async () => {
    const [technician] = await listTechnicians({})
    if (!technician) throw new Error('Seed needs technicians')
    await updateTechnician(
      technician.id,
      toTechnicianBody({ ...technicianFormValues(technician), isActive: false }),
    )
    const user = renderTeam()
    await members()
    // Not "add data": the data is there, only switched off
    expect(
      screen.queryByRole('button', { name: `Dodaj podatke o monteru: ${technician.fullName}` }),
    ).not.toBeInTheDocument()
    await waitFor(async () => {
      expect(await rowOf(technician.fullName)).toHaveTextContent(technician.workStart)
    })
    await user.click(
      screen.getByRole('button', { name: `Podaci o monteru: ${technician.fullName}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Podaci o monteru' })
    expect(within(dialog).getByLabelText(/Aktivan/)).not.toBeChecked()
    expect(within(dialog).getByLabelText(/Radi do/)).toHaveValue(technician.workEnd)
  })

  it('only members with the role technician have the button', async () => {
    renderTeam()
    const all = await listMembers()
    await members()
    const dispatcher = all.find((m) => m.role === 'dispatcher')
    expect(
      screen.queryByRole('button', { name: new RegExp(`monteru: ${dispatcher?.fullName ?? ''}`) }),
    ).not.toBeInTheDocument()
  })
})

describe('invitations', () => {
  const invite = async (user: User, email: string, role?: string) => {
    await invitations()
    await user.click(screen.getByRole('button', { name: 'Pozovi osobu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pozovi osobu' })
    await user.type(within(dialog).getByLabelText(/Email/), email)
    if (role) await user.selectOptions(within(dialog).getByLabelText(/Uloga/), role)
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    return dialog
  }

  it('invites a person; the mock server sends no e-mail, so the link is shown to pass on', async () => {
    const user = renderTeam()
    await invitations()
    await user.click(screen.getByRole('button', { name: 'Pozovi osobu' }))
    expect(
      within(await screen.findByRole('dialog', { name: 'Pozovi osobu' })).getByLabelText(/Uloga/),
    ).toHaveValue('technician')
    await user.click(screen.getByRole('button', { name: 'Odustani' }))

    await invite(user, ' Nova.Osoba@Firma.test ', 'Dispečer')
    // The sheet is replaced by the one with the link
    const link = await screen.findByLabelText(/Pošaljite osobi ovu poveznicu/)
    expect((link as HTMLInputElement).value).toMatch(/\/invite\?token=inv/)
    expect(link).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Gotovo' }))

    expect(
      await within(await invitations()).findByText('nova.osoba@firma.test'),
    ).toBeInTheDocument()
    const saved = (await listInvitations()).find((i) => i.email === 'nova.osoba@firma.test')
    expect(saved?.role).toBe('dispatcher')
  })

  it('when the server sends the e-mail itself, it says so and closes', async () => {
    server.use(
      http.post(`${API}/users/invitations`, () =>
        HttpResponse.json(
          {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'poslano@firma.test',
            role: 'technician',
            createdAt: '2026-10-01T10:00:00Z',
            expiresAt: '2026-10-08T10:00:00Z',
          },
          { status: 201 },
        ),
      ),
    )
    const user = renderTeam()
    await invite(user, 'poslano@firma.test')
    expect(await screen.findByText('Pozivnica je poslana.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Pozovi osobu' })).not.toBeInTheDocument()
    })
  })

  it('needs an address that is one, and says when the person is already in', async () => {
    const user = renderTeam()
    const [member] = await listMembers()
    await invitations()
    await user.click(screen.getByRole('button', { name: 'Pozovi osobu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pozovi osobu' })
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    expect(await within(dialog).findByText('Upišite email.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Email/), 'nije-adresa')
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    expect(await within(dialog).findByText('Upišite ispravan email.')).toBeInTheDocument()

    const email = within(dialog).getByLabelText(/Email/)
    await user.clear(email)
    await user.type(email, member?.email ?? '')
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    expect(
      await within(dialog).findByText('Ta osoba je već član ili ima otvorenu pozivnicu.'),
    ).toBeInTheDocument()
  })

  it('the link of an open invitation can be copied from the list', async () => {
    const user = renderTeam()
    await invite(user, 'kopija@firma.test')
    await screen.findByLabelText(/Pošaljite osobi ovu poveznicu/)
    await user.click(screen.getByRole('button', { name: 'Gotovo' }))
    await within(await invitations()).findByText('kopija@firma.test')
    expect(
      screen.getByRole('button', { name: 'Kopiraj poveznicu: kopija@firma.test' }),
    ).toBeInTheDocument()
  })

  it('asks before revoking, and revokes', async () => {
    const user = renderTeam()
    await invite(user, 'privremena@firma.test')
    await screen.findByLabelText(/Pošaljite osobi ovu poveznicu/)
    await user.click(screen.getByRole('button', { name: 'Gotovo' }))
    await within(await invitations()).findByText('privremena@firma.test')

    await user.click(
      screen.getByRole('button', { name: 'Opozovi pozivnicu: privremena@firma.test' }),
    )
    const confirm = await screen.findByRole('dialog', { name: 'Opozvati pozivnicu?' })
    expect((await listInvitations()).map((i) => i.email)).toContain('privremena@firma.test')
    await user.click(within(confirm).getByRole('button', { name: 'Opozovi pozivnicu' }))
    await waitFor(async () => {
      expect((await listInvitations()).map((i) => i.email)).not.toContain('privremena@firma.test')
    })
  })

  it('lists the open invitations with their role and expiry, and says when there are none', async () => {
    const open = await listInvitations()
    expect(open.length).toBeGreaterThan(0)
    renderTeam()
    const rows = within(await invitations()).getAllByRole('listitem')
    expect(rows).toHaveLength(open.length)
    expect(rows[0]).toHaveTextContent(open[0]?.email ?? '')
    expect(rows[0]).toHaveTextContent('Vrijedi do')
  })

  it('says when there are no open invitations', async () => {
    server.use(http.get(`${API}/users/invitations`, () => HttpResponse.json([])))
    renderTeam()
    expect(await screen.findByText('Nema otvorenih pozivnica.')).toBeInTheDocument()
  })

  it('says so when the invitations cannot be loaded', async () => {
    server.use(
      http.get(`${API}/users/invitations`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    renderTeam()
    expect(await screen.findByText('Pozivnice nije moguće učitati.')).toBeInTheDocument()
  })
})

describe('access to Prodaja', () => {
  /** The bodies of the writes that reach the API. */
  function captureWrites() {
    const sent: { url: string; body: Record<string, unknown> }[] = []
    server.events.on('request:start', ({ request }) => {
      if (['PUT', 'POST'].includes(request.method) && /\/users(\/|$)/.test(request.url)) {
        void request
          .clone()
          .json()
          .then((body: Record<string, unknown>) => sent.push({ url: request.url, body }))
      }
    })
    return sent
  }
  const edit = async (user: User, email: string) => {
    const member = (await listMembers()).find((m) => m.email === email)
    await members()
    await user.click(screen.getByRole('button', { name: `Uredi člana: ${member?.fullName ?? ''}` }))
    return screen.findByRole('dialog', { name: 'Uredi člana' })
  }

  it('a dispatcher with access is marked in the list; the owner is not (the owner always has it)', async () => {
    renderTeam()
    const dispatcher = (await listMembers()).find((m) => m.email === 'dispecer@alarmko.test')
    const owner = (await listMembers()).find((m) => m.email === 'vlasnik@alarmko.test')
    expect(await rowOf(dispatcher?.fullName ?? '')).toHaveTextContent('Prodaja')
    expect(await rowOf(owner?.fullName ?? '')).not.toHaveTextContent('Prodaja')
    const technician = (await listMembers()).find((m) => m.role === 'technician')
    expect(await rowOf(technician?.fullName ?? '')).not.toHaveTextContent('Prodaja')
  })

  it('the owner switches a dispatcher’s access off and the permission is sent with the change', async () => {
    const sent = captureWrites()
    const user = renderTeam()
    const dialog = await edit(user, 'dispecer@alarmko.test')
    const sales = within(dialog).getByLabelText('Pristup prodaji')
    expect(sales).toBeChecked()
    await user.click(sales)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Član je spremljen.')).toBeInTheDocument()
    await waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({
        role: 'dispatcher',
        isActive: true,
        canAccessSales: false,
      })
    })
    const saved = (await listMembers()).find((m) => m.email === 'dispecer@alarmko.test')
    expect(saved?.canAccessSales).toBe(false)
    expect(await rowOf(saved?.fullName ?? '')).not.toHaveTextContent('Prodaja')
  })

  it('a change to something else still says what it is (the switch is part of the form), and the permission is only sent where there is a switch', async () => {
    const sent = captureWrites()
    const user = renderTeam()
    const dialog = await edit(user, 'dispecer@alarmko.test')
    // Role to technician: the switch goes, a line says why, and no permission is sent
    await user.selectOptions(within(dialog).getByLabelText('Uloga'), 'Monter')
    expect(within(dialog).queryByLabelText('Pristup prodaji')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/nemaju pristup prodaji/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Član je spremljen.')
    await waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({ role: 'technician', isActive: true })
    })
  })

  it('your own sheet says the owner always has it; the switch is not there for owners', async () => {
    const user = renderTeam()
    const dialog = await edit(user, 'vlasnik@alarmko.test')
    expect(within(dialog).queryByLabelText('Pristup prodaji')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Vlasnik uvijek ima pristup prodaji.')).toBeInTheDocument()
  })

  it('on a plan without Prodaja there is no switch, no line and no mark', async () => {
    sessionStore.setTokens(await login({ email: 'vlasnik@cisto.test', password: 'demo' }))
    const sent = captureWrites()
    const user = renderTeam()
    const dialog = await edit(user, 'ana@demo.test')
    expect(within(dialog).queryByLabelText('Pristup prodaji')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/prodaji/i)).not.toBeInTheDocument()
    await user.click(within(dialog).getByLabelText(/Aktivan/))
    await user.click(within(dialog).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Član je spremljen.')
    await waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({ role: 'dispatcher', isActive: false })
    })
    const ana = (await listMembers()).find((m) => m.email === 'ana@demo.test')
    expect(await rowOf(ana?.fullName ?? '')).not.toHaveTextContent('Prodaja')
  })

  it('an invitation of a dispatcher can carry the permission; for a technician or on a plan without Prodaja there is no box', async () => {
    const sent = captureWrites()
    const user = renderTeam()
    await invitations()
    await user.click(screen.getByRole('button', { name: 'Pozovi osobu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pozovi osobu' })
    // A technician is the default: no box
    expect(within(dialog).queryByLabelText('Pristup prodaji')).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText(/Uloga/), 'Dispečer')
    await user.type(within(dialog).getByLabelText(/Email/), 'prodaja@firma.test')
    await user.click(within(dialog).getByLabelText('Pristup prodaji'))
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    await screen.findByLabelText(/Pošaljite osobi ovu poveznicu/)
    await waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({
        email: 'prodaja@firma.test',
        role: 'dispatcher',
        canAccessSales: true,
      })
    })
    const saved = (await listInvitations()).find((i) => i.email === 'prodaja@firma.test')
    expect(saved?.canAccessSales).toBe(true)
  })

  it('a dispatcher invited without ticking the box is sent without the permission (the contract’s default is no)', async () => {
    const sent = captureWrites()
    const user = renderTeam()
    await invitations()
    await user.click(screen.getByRole('button', { name: 'Pozovi osobu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pozovi osobu' })
    await user.selectOptions(within(dialog).getByLabelText(/Uloga/), 'Dispečer')
    await user.type(within(dialog).getByLabelText(/Email/), 'bez@firma.test')
    await user.click(within(dialog).getByRole('button', { name: 'Pošalji pozivnicu' }))
    await screen.findByLabelText(/Pošaljite osobi ovu poveznicu/)
    await waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({ email: 'bez@firma.test', role: 'dispatcher' })
    })
    expect(
      (await listInvitations()).find((i) => i.email === 'bez@firma.test')?.canAccessSales,
    ).toBe(false)
  })

  it('on a plan without Prodaja the invitation has no box either', async () => {
    sessionStore.setTokens(await login({ email: 'vlasnik@cisto.test', password: 'demo' }))
    const user = renderTeam()
    await user.click(await screen.findByRole('button', { name: 'Pozovi osobu' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pozovi osobu' })
    await user.selectOptions(within(dialog).getByLabelText(/Uloga/), 'Dispečer')
    expect(within(dialog).queryByLabelText('Pristup prodaji')).not.toBeInTheDocument()
  })
})
