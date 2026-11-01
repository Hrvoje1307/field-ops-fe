import { expect, type Page, test } from '@playwright/test'

import {
  apiGet,
  type Definition,
  expectSignedInAs,
  fillRequired,
  labelled,
  resetMock,
  signIn,
  TENANTS,
} from './support'

interface Thread {
  id: string
  subject: string
  mailbox: { id: string; kind: string; emailAddress: string }
  deal?: { id: string; title: string } | null
  classification?: { category: string; source: string } | null
}
interface ThreadDetail extends Thread {
  drafts: { id: string; status: string; to: { email: string }[] }[]
  messages: { id: string; direction: string }[]
  mailboxes: { id: string; canSend: boolean }[]
}
interface Stage {
  id: string
  name: string
  kind: string
}
interface JobType {
  id: string
  name: string
  isActive: boolean
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

async function dealIdOf(page: Page, email: string, threadId: string): Promise<string> {
  const [thread] = await apiGet<[{ deal?: { id: string } | null }]>(page, email, [
    `/sales/threads/${threadId}`,
  ])
  if (!thread.deal) throw new Error('The conversation has no deal')
  return thread.deal.id
}

const hook = (page: Page, hold: boolean) =>
  page.evaluate((value) => {
    ;(
      window as unknown as { __fieldopsHoldMailboxes: (h: boolean) => void }
    ).__fieldopsHoldMailboxes(value)
  }, hold)

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the main flow: connect a mailbox, answer an inquiry, win the deal and convert it into a job', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [list, stages, jobTypes, jobFields, clientFields, locationFields] = await apiGet<
        [{ items: Thread[] }, Stage[], JobType[], Definition[], Definition[], Definition[]]
      >(page, tenant.owner, [
        '/sales/threads?isSales=true&unlinked=true&pageSize=100',
        '/sales/stages',
        '/job-types',
        '/custom-fields?entity=job',
        '/custom-fields?entity=client',
        '/custom-fields?entity=location',
      ])
      // An inquiry nobody has linked, in a shared mailbox the company can answer from
      let inquiry: ThreadDetail | undefined
      for (const item of list.items.filter((t) => t.mailbox.kind === 'shared')) {
        const [full] = await apiGet<[ThreadDetail]>(page, tenant.owner, [
          `/sales/threads/${item.id}`,
        ])
        if (
          full.mailboxes.some((m) => m.id === full.mailbox.id && m.canSend) &&
          !full.drafts.some((d) => !['discarded', 'sent'].includes(d.status))
        ) {
          inquiry = full
          break
        }
      }
      const won = stages.find((s) => s.kind === 'won')
      const jobType = jobTypes.find((type) => type.isActive)
      if (!inquiry || !won || !jobType)
        throw new Error('Seed needs an inquiry, a won stage, a job type')

      // 1. Connect a mailbox
      await hook(page, true)
      await page.goto('/settings/sales/mailboxes')
      const address = `prodaja@${tenant.owner.split('@')[1] ?? ''}`
      await page.getByRole('button', { name: 'Spoji sandučić' }).first().click()
      await page.getByRole('menuitem', { name: 'Gmail ili Google Workspace' }).click()
      await page.getByRole('button', { name: 'Nastavi na prijavu' }).click()
      await page.getByLabel('Račun s kojim se prijavljujete').fill(address)
      await page.getByRole('button', { name: 'Dopusti pristup' }).click()
      await expect(page.getByText('Sandučić je spojen.').first()).toBeVisible()
      const row = page
        .getByRole('list', { name: 'Popis sandučića' })
        .getByRole('listitem')
        .filter({ hasText: address })
      await expect(row.getByText('Spaja se')).toBeVisible()
      await hook(page, false)
      await expect(row.getByText('Aktivan')).toBeVisible()

      // 2. The inquiry is in the inbox
      await page.getByRole('link', { name: 'Prodaja', exact: true }).first().click()
      await page.getByRole('link', { name: 'Inbox' }).click()
      await page.getByRole('tab', { name: 'Nepovezano', exact: true }).click()
      await page
        .getByRole('button', { name: new RegExp(inquiry.subject) })
        .first()
        .click()
      const view = page.getByRole('article', { name: inquiry.subject })
      await expect(view).toBeVisible()

      // 3. Correct the category (one click)
      await view
        .getByRole('region', { name: 'Što je AI prepoznao' })
        .getByRole('button', { name: 'Traženje ponude' })
        .click()
      await expect(page.getByText('Ispravak je spremljen.')).toBeVisible()
      await expect
        .poll(async () => {
          const [t] = await apiGet<[ThreadDetail]>(page, tenant.owner, [
            `/sales/threads/${inquiry.id}`,
          ])
          return t.classification
        })
        .toMatchObject({ category: 'quote_request', source: 'user' })

      // 4. Make a deal from it
      await view.getByRole('button', { name: 'Napravi priliku' }).click()
      const dealSheet = page.getByRole('dialog', { name: 'Nova prilika iz razgovora' })
      await dealSheet.getByLabel(labelled('Naziv')).fill('Glavni tok')
      await dealSheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(dealSheet).toBeHidden()
      await expect(view.getByRole('link', { name: 'Prilika: Glavni tok' })).toBeVisible()

      // 5. An AI draft: asked for, written, read by the person
      await view.getByRole('button', { name: 'Pripremi nacrt' }).click()
      const ask = page.getByRole('dialog', { name: 'Pripremi nacrt odgovora' })
      await ask.getByLabel('Upute za nacrt').fill('Ponudi razgovor na lokaciji.')
      await ask.getByRole('button', { name: 'Pripremi nacrt' }).click()
      await expect(ask).toBeHidden()
      const draft = view.getByRole('region', { name: 'Nacrt odgovora' })
      await expect(draft.getByLabel(labelled('Tekst'))).not.toHaveValue('')

      // 6. Send it: the person confirms, the message is the server's
      await draft.getByRole('button', { name: 'Pošalji', exact: true }).click()
      const confirm = page.getByRole('dialog', { name: 'Poslati poruku?' })
      await confirm.getByRole('button', { name: 'Pošalji poruku' }).click()
      await expect(page.getByText('Poruka je poslana.')).toBeVisible()
      await expect(confirm).toBeHidden()
      await expect(draft.getByText('Poslan', { exact: true })).toBeVisible()
      const [sent] = await apiGet<[ThreadDetail]>(page, tenant.owner, [
        `/sales/threads/${inquiry.id}`,
      ])
      expect(sent.messages.length).toBe(inquiry.messages.length + 1)

      // 7. Win the deal from its page: the stage is the tenant's
      await view.getByRole('link', { name: 'Prilika: Glavni tok' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Glavni tok' })).toBeVisible()
      await page.getByLabel('Faza').selectOption({ label: won.name })
      // On the deal's own page the conversion form opens at once
      const sheet = page.getByRole('dialog', { name: 'Pretvori u nalog' })
      await expect(sheet).toBeVisible()
      // 8. Convert it: the client is new, the person confirms every field
      await sheet.getByRole('button', { name: 'Novi klijent' }).click()
      await expect(sheet.getByLabel(labelled('Ime i prezime'))).not.toHaveValue('')
      await fillRequired(sheet, clientFields)
      await sheet.getByLabel(labelled('Ulica i kućni broj')).fill('Glavna ulica 1')
      await sheet.getByLabel(labelled('Mjesto')).fill('Zagreb')
      await fillRequired(sheet, locationFields)
      await sheet.getByLabel(labelled('Vrsta naloga')).selectOption({ label: jobType.name })
      await fillRequired(sheet, jobFields)
      await sheet.getByRole('button', { name: 'Pretvori u nalog' }).click()
      await expect(page.getByText('Prilika je pretvorena u nalog.')).toBeVisible()
      await expect(sheet).toBeHidden()

      // 9. The job is in the list of jobs
      const [deal] = await apiGet<[{ jobId?: string | null }]>(page, tenant.owner, [
        `/sales/deals/${inquiry.deal?.id ?? (await dealIdOf(page, tenant.owner, inquiry.id))}`,
      ])
      expect(deal.jobId).toBeTruthy()
      const [job] = await apiGet<[{ number: string; title: string }]>(page, tenant.owner, [
        `/jobs/${deal.jobId ?? ''}`,
      ])
      await page.getByRole('button', { name: 'Otvori nalog' }).click()
      await expect(page).toHaveURL(`/jobs/${deal.jobId ?? ''}`)
      await page.getByRole('link', { name: 'Nalozi', exact: true }).click()
      await expect(page).toHaveURL(/\/jobs/)
      await expect(page.getByText(job.number).first()).toBeVisible()
    })
  })
}
