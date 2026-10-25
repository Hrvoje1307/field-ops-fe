import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { authKeys, getMe, login, sessionStore } from '@/entities/auth'
import { listMessages } from '@/entities/message'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import type { JobRow, TenantData } from '@/shared/api/mocks/db/rows'
import { server } from '@/shared/api/mocks/node'
import { configureSessionStore } from '@/shared/api/session-port'
import { Toaster } from '@/shared/ui/sonner'

import { JobMessages } from './job-messages'

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

function tenant(): TenantData {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  if (!t) throw new Error('tenant')
  return t
}

const contactsOf = (t: TenantData, job: JobRow) =>
  t.contacts.filter((c) => c.clientId === job.clientId && !c.deletedAt)

/** A scheduled job whose client has a phone that takes SMS, and no messages yet. */
function freshJob(): JobRow {
  const t = tenant()
  const job = t.jobs.find(
    (j) =>
      j.status === 'scheduled' &&
      !t.messages.some((m) => m.jobId === j.id) &&
      contactsOf(t, j).some((c) => c.phone && c.receivesSms),
  )
  if (!job) throw new Error('Seed needs a job with a phone and no messages')
  return job
}

async function renderMessages(jobId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await queryClient.query({ queryKey: authKeys.me, queryFn: ({ signal }) => getMe(signal) })
  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <JobMessages jobId={jobId} />
      </Suspense>
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function openSend(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Pošalji poruku' }))
  return screen.findByRole('dialog', { name: 'Pošalji poruku klijentu' })
}

describe('the messages of a job', () => {
  it('lists what the client has been sent, with how it ended', async () => {
    const t = tenant()
    const failed = t.messages.find((m) => m.outcome === 'failed')
    if (!failed?.jobId) throw new Error('Seed needs a failed message')
    await renderMessages(failed.jobId)
    const rows = await screen.findAllByTestId('job-message')
    expect(rows.length).toBeGreaterThan(0)
    const row = rows.find((r) => r.textContent.includes(failed.to))
    if (!row) throw new Error('No row for the failed message')
    expect(row).toHaveTextContent('Nije poslano')
    // The text and the reason are behind the row
    expect(within(row).queryByText('Broj nije dostupan.')).not.toBeVisible()
    await userEvent.click(within(row).getByText(failed.to))
    expect(within(row).getByText('Broj nije dostupan.')).toBeVisible()
  })

  it('says when nothing has been sent', async () => {
    await renderMessages(freshJob().id)
    expect(
      await screen.findByText('Klijentu još nije poslana nijedna poruka za ovaj nalog.'),
    ).toBeInTheDocument()
  })

  it('sends a template to the client, shows it as the client would get it, and lists it', async () => {
    const job = freshJob()
    const t = tenant()
    const phones = contactsOf(t, job)
      .filter((c) => c.phone && c.receivesSms)
      .map((c) => c.phone)
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    await user.selectOptions(
      await within(sheet).findByLabelText(/Vrsta poruke/),
      'Monter je krenuo prema klijentu',
    )
    expect(within(sheet).getByTestId('message-recipients')).toHaveTextContent(phones.join(', '))
    // The preview is this job's: its number is in the text
    await waitFor(
      () => {
        expect(within(sheet).getByTestId('message-preview')).toHaveTextContent(job.number)
      },
      { timeout: 3000 },
    )
    await user.click(within(sheet).getByRole('button', { name: 'Pošalji' }))
    expect(await screen.findByText(/Poruk[ae] (je|su) poslan[ae]/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByTestId('job-message').length).toBeGreaterThan(0)
    })
    const sent = (await listMessages({ jobId: job.id })).items
    expect(sent.map((m) => m.to).sort()).toEqual([...phones].sort())
    expect(sent[0]).toMatchObject({ channel: 'sms', templateKey: 'on_the_way' })
  })

  it('sends text written for this once to the chosen contact', async () => {
    const job = freshJob()
    const t = tenant()
    const contact = contactsOf(t, job).find((c) => c.email)
    if (!contact?.email) throw new Error('Seed needs a contact with an e-mail')
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    await user.click(within(sheet).getByLabelText('Email'))
    await user.click(within(sheet).getByLabelText('Vlastiti tekst'))
    await user.type(
      within(sheet).getByLabelText(/Tekst poruke/),
      'Dobar dan, javljamo se u vezi naloga {{broj_naloga}.',
    )
    await user.selectOptions(
      within(sheet).getByLabelText('Kome'),
      `${contact.name} · ${contact.email}`,
    )
    expect(within(sheet).getByTestId('message-recipients')).toHaveTextContent(contact.email)
    await user.click(within(sheet).getByRole('button', { name: 'Pošalji' }))
    await screen.findByText('Poruka je poslana.')
    const [message] = (await listMessages({ jobId: job.id })).items
    expect(message).toMatchObject({ channel: 'email', to: contact.email, templateKey: null })
    expect(message?.body).toContain(`naloga ${job.number}.`)
  })

  it('offers the templates of the channel that are switched on, and no others', async () => {
    const job = freshJob()
    const t = tenant()
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    const template = within(sheet).getByLabelText(/Vrsta poruke/)
    // "On the way" exists only as an SMS
    expect(
      within(template).getByRole('option', { name: 'Monter je krenuo prema klijentu' }),
    ).toBeVisible()
    await user.click(within(sheet).getByLabelText('Email'))
    expect(
      within(template).queryByRole('option', { name: 'Monter je krenuo prema klijentu' }),
    ).not.toBeInTheDocument()
    expect(within(template).getByRole('option', { name: 'Izvještaj je spreman' })).toBeVisible()
    await user.click(within(sheet).getByLabelText('SMS'))
    expect(
      within(template).getByRole('option', { name: 'Monter je krenuo prema klijentu' }),
    ).toBeVisible()
    expect(t.messageTemplates.length).toBeGreaterThan(0)
  })

  it('does not offer a template that is switched off', async () => {
    const job = freshJob()
    const t = tenant()
    const own = t.messageTemplates.find((m) => m.key === 'on_the_way' && m.channel === 'sms')
    if (!own) throw new Error('Seed needs its own on-the-way text')
    own.isActive = false
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    expect(
      within(within(sheet).getByLabelText(/Vrsta poruke/)).queryByRole('option', {
        name: 'Monter je krenuo prema klijentu',
      }),
    ).not.toBeInTheDocument()
  })

  it('a chosen contact is the only one the message goes to', async () => {
    const t = tenant()
    const job = t.jobs.find(
      (j) => j.status === 'scheduled' && contactsOf(t, j).filter((c) => c.phone).length >= 2,
    )
    if (!job) throw new Error('Seed needs a job whose client has two phones')
    const [first, second] = contactsOf(t, job).filter((c) => c.phone)
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    await user.selectOptions(
      within(sheet).getByLabelText('Kome'),
      `${second?.name ?? ''} · ${second?.phone ?? ''}`,
    )
    const line = within(sheet).getByTestId('message-recipients')
    expect(line).toHaveTextContent(second?.phone ?? '')
    expect(line).not.toHaveTextContent(first?.phone ?? '')
  })

  it('needs a kind of message, or some words', async () => {
    const job = freshJob()
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    await user.click(within(sheet).getByRole('button', { name: 'Pošalji' }))
    expect(await within(sheet).findByText('Odaberite vrstu poruke.')).toBeInTheDocument()
    await user.click(within(sheet).getByLabelText('Vlastiti tekst'))
    await user.click(within(sheet).getByRole('button', { name: 'Pošalji' }))
    expect(await within(sheet).findByText('Upišite tekst poruke.')).toBeInTheDocument()
    expect((await listMessages({ jobId: job.id })).items).toHaveLength(0)
  })

  it('cannot send when nobody can be reached, and says why', async () => {
    const job = freshJob()
    const t = tenant()
    for (const c of contactsOf(t, job)) c.phone = null
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    expect(
      await within(sheet).findByText(/Nema kontakta kojem se ova poruka može poslati/),
    ).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Pošalji' })).toBeDisabled()
  })

  it('SMS switched off for the job type is explained, and e-mail still works', async () => {
    const job = freshJob()
    const t = tenant()
    const type = t.jobTypes.find((x) => x.id === job.jobTypeId)
    if (type) type.smsEnabled = false
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    await user.click(within(sheet).getByLabelText('Vlastiti tekst'))
    await user.type(within(sheet).getByLabelText(/Tekst poruke/), 'Pozdrav')
    await user.click(within(sheet).getByRole('button', { name: 'Pošalji' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/SMS je isključen/)
  })

  it('without SMS in the plan only e-mail is offered', async () => {
    const me = await getMe()
    server.use(http.get(`${API}/me`, () => HttpResponse.json({ ...me, features: [] })))
    const job = freshJob()
    const user = await renderMessages(job.id)
    const sheet = await openSend(user)
    expect(within(sheet).queryByLabelText('SMS')).not.toBeInTheDocument()
    expect(within(sheet).getByLabelText('Email')).toBeChecked()
  })

  it('says so when the messages cannot be loaded', async () => {
    server.use(
      http.get(`${API}/messages`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    await renderMessages(freshJob().id)
    expect(await screen.findByText('Poruke nije moguće učitati.')).toBeInTheDocument()
  })
})
