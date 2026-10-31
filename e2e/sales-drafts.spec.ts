import { expect, type Page, test } from '@playwright/test'

import { apiGet, apiSend, expectSignedInAs, labelled, resetMock, signIn, TENANTS } from './support'

interface Draft {
  id: string
  threadId: string
  mailboxId: string
  kind: string
  status: string
  subject: string
  bodyText: string
  to: { email: string }[]
  cc: { email: string }[]
  version: number
  instructions?: string | null
}
interface Thread {
  id: string
  subject: string
  mailbox: { id: string; emailAddress: string }
  drafts: Draft[]
  messages: { id: string; direction: string; bodyText?: string | null }[]
  mailboxes: { id: string; emailAddress: string; canSend: boolean }[]
}
interface Summary {
  id: string
  subject: string
  mailbox: { id: string; kind: string }
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

async function start(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
}
const thread = async (page: Page, email: string, id: string) =>
  (await apiGet<[Thread]>(page, email, [`/sales/threads/${id}`]))[0]
const view = (page: Page, subject: string) => page.getByRole('article', { name: subject })
const editor = (page: Page, subject: string) =>
  view(page, subject).getByRole('region', { name: 'Nacrt odgovora' })

/** A shared-mailbox conversation, as the first of its kind in the inbox. */
async function pickThread(page: Page, email: string, without: boolean) {
  const [list] = await apiGet<[{ items: Summary[] }]>(page, email, [
    '/sales/threads?isSales=true&pageSize=100',
  ])
  for (const item of list.items.filter((t) => t.mailbox.kind === 'shared')) {
    const full = await thread(page, email, item.id)
    const live = full.drafts.filter((d) => !['discarded', 'sent'].includes(d.status))
    if (without ? live.length === 0 : live.some((d) => d.status === 'ready')) return full
  }
  throw new Error('Seed needs a conversation')
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('ask for a draft: the editor is locked while it is written, then it is a plain-text form', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const target = await pickThread(page, tenant.owner, true)
      await page.goto(`/sales/inbox?card=all&thread=${target.id}`)
      await page.getByRole('button', { name: 'Pripremi nacrt' }).click()
      const dialog = page.getByRole('dialog', { name: 'Pripremi nacrt odgovora' })
      const text = dialog.getByLabel('Upute za nacrt')
      await text.fill('Ponudi termin u utorak.')
      await expect(dialog.getByText('23 od 1000')).toBeVisible()
      await dialog.getByRole('button', { name: 'Pripremi nacrt' }).click()
      await expect(dialog).toBeHidden()

      const draft = editor(page, target.subject)
      await expect(draft.getByText('Pripremam…')).toBeVisible()
      await expect(draft.getByRole('textbox')).toHaveCount(0)
      // Locked until it is written; then everything is editable
      await expect(draft.getByLabel(labelled('Tekst'))).toBeVisible()
      await expect(draft.getByLabel(labelled('Tekst'))).not.toHaveValue('')
      const [saved] = (await thread(page, tenant.owner, target.id)).drafts
      expect(saved).toMatchObject({
        kind: expect.any(String),
        instructions: 'Ponudi termin u utorak.',
      })
      expect((await thread(page, tenant.owner, target.id)).drafts[0]?.mailboxId).toBe(
        target.mailbox.id,
      )
    })

    test('sending: unsaved edits are saved first, the confirmation names everyone, the saved version is what goes out', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const target = await pickThread(page, tenant.owner, false)
      const ready = target.drafts.find((d) => d.status === 'ready')
      if (!ready) throw new Error('Seed needs a ready draft')
      await page.goto(`/sales/inbox?card=all&thread=${target.id}`)
      const draft = editor(page, target.subject)
      const body = draft.getByLabel(labelled('Tekst'))
      await body.fill('Poštovani, ponuda vrijedi do petka.\nLijep pozdrav')
      await draft.getByLabel('Kopija').fill('kopija@poduzece.test')
      await expect(draft.getByText('Ima nespremljenih izmjena.')).toBeVisible()

      const calls: string[] = []
      page.on('request', (request) => {
        if (
          ['PUT', 'POST'].includes(request.method()) &&
          request.url().includes(`/sales/drafts/${ready.id}`)
        ) {
          calls.push(
            `${request.method()} ${new URL(request.url()).pathname.split('/').pop() ?? ''}`,
          )
        }
      })
      await draft.getByRole('button', { name: 'Pošalji', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Poslati poruku?' })
      await expect(dialog.getByText(ready.to[0]?.email ?? '').first()).toBeVisible()
      await expect(dialog.getByText('kopija@poduzece.test')).toBeVisible()
      await expect(
        dialog.getByText(
          target.mailboxes.find((m) => m.id === ready.mailboxId)?.emailAddress ?? '',
        ),
      ).toBeVisible()
      await expect(dialog.getByText(ready.subject)).toBeVisible()
      await expect(dialog.getByText('Prije slanja spremaju se vaše izmjene.')).toBeVisible()
      await dialog.getByRole('button', { name: 'Pošalji poruku' }).click()
      await expect(page.getByText('Poruka je poslana.')).toBeVisible()
      await expect(dialog).toBeHidden()

      // Saved, then sent, in that order, and what went out is the text that was typed
      expect(calls).toEqual([`PUT ${ready.id}`, 'POST send'])
      const [sent] = await apiGet<[Draft]>(page, tenant.owner, [`/sales/drafts/${ready.id}`])
      expect(sent).toMatchObject({ status: 'sent' })
      expect(sent.bodyText).toBe('Poštovani, ponuda vrijedi do petka.\nLijep pozdrav')
      expect(sent.cc.map((c) => c.email)).toEqual(['kopija@poduzece.test'])
      // The message is the server's: it is in the conversation once it is read again
      const after = await thread(page, tenant.owner, target.id)
      expect(after.messages.length).toBe(target.messages.length + 1)
      await expect(view(page, target.subject).getByTestId('thread-message')).toHaveCount(
        after.messages.length,
      )
      await expect(editor(page, target.subject).getByText('Poslan', { exact: true })).toBeVisible()
    })

    test('a stale version: nothing is sent, the typed text stays in the editor, and there is a warning', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const target = await pickThread(page, tenant.owner, false)
      const ready = target.drafts.find((d) => d.status === 'ready')
      if (!ready) throw new Error('Seed needs a ready draft')
      await page.goto(`/sales/inbox?card=all&thread=${target.id}`)
      const draft = editor(page, target.subject)
      await expect(draft.getByLabel(labelled('Tekst'))).toBeVisible()
      await draft.getByLabel(labelled('Tekst')).fill('Moj tekst koji se ne smije izgubiti.')

      // Someone else saves the draft meanwhile
      const other = await apiSend(page, tenant.owner, 'PUT', `/sales/drafts/${ready.id}`, {
        subject: ready.subject,
        bodyText: 'Tuđa izmjena.',
        to: ready.to,
        cc: [],
        version: ready.version,
      })
      expect(other.status).toBe(200)

      await draft.getByRole('button', { name: 'Pošalji', exact: true }).click()
      await page.getByRole('button', { name: 'Pošalji poruku' }).click()
      await expect(page.getByText(/Nacrt je u međuvremenu promijenjen/).first()).toBeVisible()
      await expect(draft.getByRole('alert')).toContainText('Vaš tekst je ostao u uređivaču')
      await expect(draft.getByLabel(labelled('Tekst'))).toHaveValue(
        'Moj tekst koji se ne smije izgubiti.',
      )
      const [now] = await apiGet<[Draft]>(page, tenant.owner, [`/sales/drafts/${ready.id}`])
      expect(now.status).not.toBe('sent')
      expect(now.bodyText).toBe('Tuđa izmjena.')

      // Saved again on the newest version, it replaces theirs on purpose
      await draft.getByRole('button', { name: 'Spremi izmjene' }).click()
      await expect(page.getByText('Izmjene su spremljene.')).toBeVisible()
      const [replaced] = await apiGet<[Draft]>(page, tenant.owner, [`/sales/drafts/${ready.id}`])
      expect(replaced.bodyText).toBe('Moj tekst koji se ne smije izgubiti.')
    })

    test('save to the mailbox: the changes first, then the same draft is updated there; discarding says it goes from the mailbox too', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const target = await pickThread(page, tenant.owner, false)
      const ready = target.drafts.find((d) => d.status === 'ready')
      if (!ready) throw new Error('Seed needs a ready draft')
      await page.goto(`/sales/inbox?card=all&thread=${target.id}`)
      const draft = editor(page, target.subject)
      const body = draft.getByLabel(labelled('Tekst'))
      await body.fill('Prva verzija u sandučiću.')
      await draft.getByRole('button', { name: 'Spremi u sandučić' }).click()
      await expect(page.getByText('Nacrt je spremljen u sandučić.')).toBeVisible()
      await expect(draft.getByText('Spremljen u sandučić').first()).toBeVisible()
      await expect
        .poll(
          async () =>
            (await thread(page, tenant.owner, target.id)).drafts.find((d) => d.id === ready.id)
              ?.status,
        )
        .toBe('saved_to_mailbox')

      // Still editable; saving again changes the same draft
      await body.fill('Druga verzija u sandučiću.')
      await draft.getByRole('button', { name: 'Spremi u sandučić' }).click()
      await expect
        .poll(
          async () =>
            (await apiGet<[Draft]>(page, tenant.owner, [`/sales/drafts/${ready.id}`]))[0].bodyText,
        )
        .toBe('Druga verzija u sandučiću.')
      const live = (await thread(page, tenant.owner, target.id)).drafts.filter(
        (d) => d.kind === ready.kind && d.status === 'saved_to_mailbox',
      )
      expect(live).toHaveLength(1)

      await draft.getByRole('button', { name: 'Odbaci' }).click()
      const dialog = page.getByRole('dialog', { name: 'Odbaciti nacrt?' })
      await expect(
        dialog.getByText(/briše se i nacrt spremljen u Gmailu ili Outlooku/),
      ).toBeVisible()
      await dialog.getByRole('button', { name: 'Odbaci' }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText('Nacrt je odbačen.')).toBeVisible()
      await expect(draft).toHaveCount(0)
    })

    test('a failed draft says why and "Pokušaj ponovno" asks again with the same instructions', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const [list] = await apiGet<[{ items: Summary[] }]>(page, tenant.owner, [
        '/sales/threads?isSales=true&pageSize=100',
      ])
      let failed: { thread: Thread; draft: Draft } | null = null
      for (const item of list.items) {
        const full = await thread(page, tenant.owner, item.id)
        const draft = full.drafts.find((d) => d.status === 'failed')
        if (draft) {
          failed = { thread: full, draft }
          break
        }
      }
      if (!failed) throw new Error('Seed needs a failed draft')
      await page.goto(`/sales/inbox?card=all&thread=${failed.thread.id}`)
      const draft = editor(page, failed.thread.subject)
      await expect(draft.getByText('Nije uspio').first()).toBeVisible()
      await expect(draft.getByRole('alert')).toBeVisible()
      await draft.getByRole('button', { name: 'Pokušaj ponovno' }).click()
      await expect(page.getByText('Novi nacrt se priprema s istim uputama.')).toBeVisible()
      await expect
        .poll(async () => (await thread(page, tenant.owner, failed.thread.id)).drafts.length)
        .toBe(failed.thread.drafts.length + 1)
      const created = (await thread(page, tenant.owner, failed.thread.id)).drafts.find(
        (d) => d.id !== failed.draft.id && !failed.thread.drafts.some((o) => o.id === d.id),
      )
      expect(created).toMatchObject({ kind: failed.draft.kind, mailboxId: failed.draft.mailboxId })
    })
  })
}

test('the dispatcher can write a draft too; a conversation of a personal mailbox is answered from that mailbox', async ({
  page,
}) => {
  const tenant = TENANTS[0]
  await start(page, tenant.dispatcher, tenant.name)
  const [list] = await apiGet<[{ items: Summary[] }]>(page, tenant.dispatcher, [
    '/sales/threads?isSales=true&pageSize=100',
  ])
  const personal = list.items.find((t) => t.mailbox.kind === 'personal')
  if (!personal) throw new Error('Seed needs a personal conversation')
  await page.goto(`/sales/inbox?card=all&thread=${personal.id}`)
  await page.getByRole('button', { name: 'Pripremi nacrt' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pripremi nacrt odgovora' })
  await dialog.getByRole('button', { name: 'Pripremi nacrt' }).click()
  await expect(dialog).toBeHidden()
  const full = await thread(page, tenant.dispatcher, personal.id)
  const made = full.drafts.at(-1)
  expect(made?.mailboxId).toBe(personal.mailbox.id)
})
