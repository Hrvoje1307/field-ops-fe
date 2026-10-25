import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface JobSummary {
  id: string
  number: string
  title: string
  status: string
}
interface JobPage {
  items: JobSummary[]
}
interface Job extends JobSummary {
  rescheduleRequested?: boolean
  rescheduleNote?: string | null
  clientDetail?: { contacts: { phone?: string | null; receivesSms: boolean }[] }
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

/** A scheduled job whose client can be texted and has not yet asked for another time. */
async function textableJob(page: Page, email: string): Promise<Job> {
  const [list] = await apiGet<[JobPage]>(page, email, ['/jobs?status=scheduled&pageSize=50'])
  const details = await apiGet<Job[]>(
    page,
    email,
    list.items.map((job) => `/jobs/${job.id}`),
  )
  // Not one whose client has already asked for another time: there is nothing left to press
  const job = details.find(
    (candidate) =>
      !candidate.rescheduleRequested &&
      candidate.clientDetail?.contacts.some((c) => c.phone && c.receivesSms),
  )
  if (!job) throw new Error('Seed needs a scheduled job whose client has a phone')
  return job
}

/** Sends the "on the way" text from the job's page and reads the link out of the message. */
async function sendLink(page: Page, email: string, job: Job): Promise<string> {
  await page.goto(`/jobs/${job.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(job.title)
  await page.getByRole('button', { name: 'Pošalji poruku' }).click()
  const sheet = page.getByRole('dialog', { name: 'Pošalji poruku klijentu' })
  await sheet.getByLabel(/Vrsta poruke/).selectOption({ label: 'Monter je krenuo prema klijentu' })
  // The preview is the text with this job's own words in it: the technician's name and the link
  await expect(sheet.getByTestId('message-preview')).toContainText('/p/')
  await expect(sheet.getByTestId('message-preview')).not.toContainText('{')
  await sheet.getByRole('button', { name: 'Pošalji' }).click()
  await expect(page.getByText(/Poruk[ae] (je|su) poslan[ae]/)).toBeVisible()

  // The message is in the job's list, and its text carries the client's link
  await expect(page.getByTestId('job-message').first()).toBeVisible()
  const [sent] = await apiGet<[{ items: { body: string }[] }]>(page, email, [
    `/messages?jobId=${job.id}`,
  ])
  const link = sent.items
    .map((message) => /(https?:\/\/\S+\/p\/pub_\w+)/.exec(message.body)?.[1])
    .find(Boolean)
  if (!link) throw new Error('No link in the messages sent')
  return new URL(link).pathname
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the office texts a link, the client confirms on their phone, the office sees it', async ({
      page,
      context,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const job = await textableJob(page, tenant.dispatcher)
      const path = await sendLink(page, tenant.dispatcher, job)

      // The client: nobody, on a phone, in another tab
      const phone = await context.newPage()
      await phone.setViewportSize({ width: 390, height: 844 })
      await phone.goto(path)
      await expect(phone.getByTestId('public-company')).toHaveText(tenant.name)
      await expect(phone.getByText(`Nalog ${job.number}`, { exact: false })).toBeVisible()
      await expect(phone.getByTestId('public-status')).toContainText('čeka vašu potvrdu')
      // No office, no menu, no sign-in
      await expect(phone.getByRole('navigation')).toHaveCount(0)
      await phone.getByRole('button', { name: 'Potvrđujem termin' }).click()
      await expect(phone.getByTestId('public-status')).toContainText('Termin je potvrđen')
      await expect(phone.getByRole('button', { name: 'Potvrđujem termin' })).toHaveCount(0)
      // Opening the link again says the same
      await phone.reload()
      await expect(phone.getByTestId('public-status')).toContainText('Termin je potvrđen')
      await phone.close()

      await page.reload()
      await expect(page.locator('main header [data-status]')).toHaveText('Potvrđen')
    })

    test('the client asks for another time and the office sees the request', async ({
      page,
      context,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const job = await textableJob(page, tenant.dispatcher)
      const path = await sendLink(page, tenant.dispatcher, job)

      const phone = await context.newPage()
      await phone.setViewportSize({ width: 390, height: 844 })
      await phone.goto(path)
      await phone.getByRole('button', { name: 'Tražim drugi termin' }).click()
      const form = phone.getByRole('form', { name: 'Tražim drugi termin' })
      await form.getByLabel('Napomena').fill('Može li poslije podne?')
      await form.getByRole('button', { name: 'Pošalji zahtjev' }).click()
      await expect(phone.getByTestId('public-status')).toContainText('Zatražili ste novi termin')
      await expect(phone.getByRole('button', { name: 'Potvrđujem termin' })).toHaveCount(0)
      await expect(phone.getByRole('button', { name: 'Tražim drugi termin' })).toHaveCount(0)
      await phone.close()

      await page.reload()
      await expect(page.getByText('Klijent traži novi termin.')).toBeVisible()
      await expect(page.getByText('Može li poslije podne?')).toBeVisible()
    })

    test('a link that is wrong says so, without the office or a sign-in', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/p/pub_nepostojeci')
      await expect(page.getByRole('heading', { name: 'Poveznica nije ispravna' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Potvrđujem termin' })).toHaveCount(0)
      await expect(page).toHaveURL(/\/p\/pub_nepostojeci$/)
    })

    test('all messages: those that did not arrive are found and say why', async ({ page }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await page.getByRole('link', { name: 'Poruke', exact: true }).click()
      await expect(page).toHaveURL(/\/messages$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Poruke' })).toBeVisible()
      const rows = page.getByTestId('message-row')
      await expect(rows.first()).toBeVisible()
      const all = await rows.count()

      await page.getByLabel('Stanje').selectOption({ label: 'Nije poslano' })
      await expect(page).toHaveURL(/status=failed/)
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('Broj nije dostupan.')
      await rows.first().getByRole('link', { name: 'Otvori nalog' }).click()
      await expect(page).toHaveURL(/\/jobs\//)
      await expect(page.getByRole('region', { name: 'Poslane poruke' })).toBeVisible()
      await page.goBack()
      await page.getByLabel('Stanje').selectOption({ label: 'Sve poruke' })
      await expect(rows).toHaveCount(all)
    })

    test('a technician has no messages page', async ({ page }) => {
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL('/field')
      await expectSignedInAs(page, tenant.name)
      await page.goto('/messages')
      await expect(page).toHaveURL('/field')
    })
  })
}
