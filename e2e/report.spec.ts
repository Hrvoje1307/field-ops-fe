import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface Job {
  id: string
  title: string
  status: string
  report?: {
    workDone?: string | null
    materials: { name: string }[]
    photos: unknown[]
    signedByName?: string | null
    signatureAttachmentId?: string | null
    completedAt?: string | null
  } | null
}

// A phone
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

/** A technician who is on site at one job, in each tenant (and whether it wants a signature). */
const TENANTS = [
  {
    name: 'Alarmko d.o.o.',
    email: 'ivan@alarmko.test',
    job: 'Ugradnja kontrole pristupa na 3. katu',
    signature: true,
    material: { search: 'Kabel', name: /Kabel 4×0,22/ },
  },
  {
    name: 'Bura klima d.o.o.',
    email: 'ante@bura.test',
    job: 'Servis klime u dnevnom boravku',
    signature: false,
    material: { search: 'Filter', name: /Filter za klima/ },
  },
] as const

// A 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** The job's id from the report page's address. */
const jobId = (page: Page) => page.url().split('/').at(-2) ?? ''

async function openReport(page: Page, email: string, tenantName: string, title: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/field')
  await expectSignedInAs(page, tenantName)
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click()
  await expect(page.getByRole('region', { name: 'Lokacija' })).toBeVisible()
  await page.getByRole('link', { name: 'Izvještaj i završetak' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Izvještaj' })).toBeVisible()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('fills in the report on site and completes the job', async ({ page }) => {
      await openReport(page, tenant.email, tenant.name, tenant.job)
      const complete = page.getByRole('button', { name: 'Završi nalog' })

      // What is missing is said, and the button waits
      await expect(complete).toBeDisabled()
      const missing = page.getByTestId('completion-blockers')
      await expect(missing).toContainText('Upišite što je napravljeno.')
      await expect(missing).toContainText('Obavezne stavke kontrolne liste')
      if (tenant.signature) await expect(missing).toContainText('Potreban je potpis klijenta.')
      else await expect(missing).not.toContainText('potpis')

      await page.getByLabel('Što je napravljeno').fill('Radovi su obavljeni prema nalogu.')
      const checklist = page.getByRole('region', { name: 'Kontrolna lista' })
      for (const box of await checklist.getByRole('checkbox').all()) await box.check()
      await expect(checklist.getByRole('checkbox', { checked: false })).toHaveCount(0)

      // A material from the tenant's catalog
      await page.getByRole('button', { name: 'Dodaj materijal' }).click()
      const dialog = page.getByRole('dialog', { name: 'Dodaj materijal' })
      await dialog.getByRole('searchbox', { name: 'Traži materijal' }).fill(tenant.material.search)
      await dialog.getByRole('button', { name: tenant.material.name }).click()
      await dialog.getByLabel('Količina').fill('2,5')
      await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click()
      const materials = page.getByRole('region', { name: 'Materijal' })
      await expect(materials).toContainText(tenant.material.name)
      await expect(materials).toContainText('Ukupno:')

      // A photo
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG })
      await expect(page.getByRole('button', { name: 'Otvori fotografiju 1' })).toBeVisible()

      // The client signs (where the tenant asks for it)
      if (tenant.signature) {
        await page.getByLabel('Ime i prezime potpisnika').fill('Marko Horizont')
        const pad = page.getByTestId('signature-pad')
        // Raw mouse moves do not scroll, and the bar at the bottom would take them
        await pad.evaluate((element) => {
          element.scrollIntoView({ block: 'center' })
        })
        const box = await pad.boundingBox()
        if (!box) throw new Error('No signature pad')
        await page.mouse.move(box.x + 20, box.y + 40)
        await page.mouse.down()
        await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 })
        await page.mouse.move(box.x + 200, box.y + 30, { steps: 8 })
        await page.mouse.up()
        await page.getByRole('button', { name: 'Spremi potpis' }).click()
        await expect(page.getByText('Potpisao: Marko Horizont')).toBeVisible()
      }

      await expect(page.getByTestId('completion-blockers')).toHaveCount(0)
      // Completing saves the draft first, so the text does not have to be "saved" yet:
      // the API is checked for it at the end
      await expect(complete).toBeEnabled()
      await complete.click()

      // Back on the day, and the API has the finished job with its report
      await expect(page.getByText(/je završen\.$/)).toBeVisible()
      await expect(page).toHaveURL('/field')
      const today = await page.evaluate(() =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
      )
      const [day] = await apiGet<[{ jobs: Job[] }]>(page, tenant.email, [`/me/jobs?date=${today}`])
      const done = day.jobs.find((job) => job.title === tenant.job)
      expect(done?.status).toBe('completed')
      const [job] = await apiGet<[Job]>(page, tenant.email, [`/jobs/${done?.id ?? ''}`])
      expect(job.report).toMatchObject({
        workDone: 'Radovi su obavljeni prema nalogu.',
      })
      expect(job.report?.materials).toHaveLength(1)
      expect(job.report?.photos).toHaveLength(1)
      expect(job.report?.completedAt).toBeTruthy()
      if (tenant.signature) expect(job.report?.signedByName).toBe('Marko Horizont')
    })

    test('the text typed is saved as it is typed, and is there after leaving and coming back', async ({
      page,
    }) => {
      await openReport(page, tenant.email, tenant.name, tenant.job)
      await page.getByLabel('Što je napravljeno').fill('Prvi dio radova.')
      // On the server (the first save of the arrival time says "Spremljeno" before the text)
      await expect
        .poll(async () => {
          const [job] = await apiGet<[Job]>(page, tenant.email, [`/jobs/${jobId(page)}`])
          return job.report?.workDone
        })
        .toBe('Prvi dio radova.')

      await page.getByRole('link', { name: 'Natrag na nalog' }).click()
      await page.getByRole('link', { name: 'Izvještaj i završetak' }).click()
      await expect(page.getByLabel('Što je napravljeno')).toHaveValue('Prvi dio radova.')
    })
  })
}

test.describe('the office', () => {
  test('reads the report of a completed job, prints it, and sees its PDF', async ({
    page,
    context,
  }) => {
    await signIn(page, 'dispecer@alarmko.test')
    await expect(page).toHaveURL('/')
    const [found] = await apiGet<[{ items: { id: string }[] }]>(page, 'dispecer@alarmko.test', [
      '/jobs?status=completed&q=Magnetski',
    ])
    const id = found.items[0]?.id
    if (!id) throw new Error('Seed needs the completed job')
    await page.goto(`/jobs/${id}`)

    const report = page.getByTestId('report-view')
    await expect(report.getByRole('heading', { name: 'Izvještaj o radu' })).toBeVisible()
    await expect(report).toContainText('Magnetski kontakt')
    await expect(report).toContainText('Kabel 4×0,22')
    await expect(report).toContainText('Ukupno:')

    // The PDF of a completed job is a plain link (its address carries the access)
    await expect(report.getByRole('link', { name: 'Preuzmi PDF' })).toHaveAttribute('href', /.+/)

    // The printable report opens in a new window, fetched with the token
    const popup = context.waitForEvent('page')
    await report.getByRole('button', { name: 'Ispiši izvještaj' }).click()
    const printed = await popup
    await expect(printed.locator('h2')).toContainText('Izvještaj o radu')
  })
})
