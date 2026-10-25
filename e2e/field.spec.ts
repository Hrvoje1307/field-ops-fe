import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface Job {
  id: string
  title: string
  status: string
  allowedTransitions: string[]
  clientDetail?: { contacts: { name: string; phone?: string | null }[] }
  locationDetail?: { accessCodes?: string | null }
}
interface Day {
  jobs: Job[]
}
interface JobPage {
  items: { id: string }[]
}

// A phone
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

/** Today in the tenant zone (both mock tenants are in Europe/Zagreb). */
const today = (page: Page) =>
  page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
  )

async function openDay(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/field')
  await expectSignedInAs(page, tenantName)
  const [day] = await apiGet<[Day]>(page, email, [`/me/jobs?date=${await today(page)}`])
  return day
}

const fieldJobs = (page: Page) => page.getByTestId('field-job')
/** The job's own page is showing (the URL changes before the page does). */
const onJobPage = (page: Page) =>
  expect(page.getByRole('region', { name: 'Lokacija' })).toBeVisible()

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test("the day lists the technician's own jobs with call and navigation", async ({ page }) => {
      const day = await openDay(page, tenant.technician, tenant.name)
      expect(day.jobs.length).toBeGreaterThan(0)
      await expect(fieldJobs(page)).toHaveCount(day.jobs.length)
      for (const [index, job] of day.jobs.entries()) {
        const card = fieldJobs(page).nth(index)
        await expect(card).toContainText(job.title)
        await expect(card.getByRole('link', { name: 'Navigacija' })).toHaveAttribute(
          'href',
          /google\.com\/maps\/dir/,
        )
        const phone = job.clientDetail?.contacts.find((contact) => contact.phone)?.phone
        if (phone) {
          await expect(card.getByRole('link', { name: /^Nazovi / }).first()).toHaveAttribute(
            'href',
            /^tel:\+/,
          )
        }
      }
    })

    test('opens a job and runs it on the way, then on site', async ({ page }) => {
      const day = await openDay(page, tenant.technician, tenant.name)
      const job = day.jobs.find((candidate) => candidate.allowedTransitions.includes('en_route'))
      if (!job) throw new Error('Seed needs a job the technician can start')
      const index = day.jobs.indexOf(job)

      await fieldJobs(page).nth(index).getByRole('link').first().click()
      await onJobPage(page)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(job.title)
      await page.getByRole('button', { name: 'Označi: na putu' }).click()
      await expect(page.getByText('Status naloga: Na putu.')).toBeVisible()

      await page.getByRole('button', { name: 'Označi: na lokaciji' }).click()
      await expect(page.getByText('Status naloga: Na lokaciji.')).toBeVisible()
      // On site: finishing is the report (not here yet), what remains is "Više"
      await expect(page.getByRole('button', { name: 'Više radnji' })).toBeVisible()
      await expect(page.getByRole('button', { name: /Označi: na/ })).toHaveCount(0)

      const [after] = await apiGet<[Job]>(page, tenant.technician, [`/jobs/${job.id}`])
      expect(after.status).toBe('on_site')
    })

    test('access codes stay out of the page until tapped', async ({ page }) => {
      const day = await openDay(page, tenant.technician, tenant.name)
      const job = day.jobs.find((candidate) => candidate.locationDetail?.accessCodes)
      const codes = job?.locationDetail?.accessCodes
      test.skip(!job || !codes, 'No job with access codes for this technician in the seed')
      if (!job || !codes) return

      await fieldJobs(page).filter({ hasText: job.title }).getByRole('link').first().click()
      await onJobPage(page)
      expect(await page.evaluate((text) => document.body.innerText.includes(text), codes)).toBe(
        false,
      )
      await page.getByRole('button', { name: 'Prikaži: Pristupne šifre' }).click()
      await expect(page.getByRole('region', { name: 'Lokacija' })).toContainText(codes)
    })

    test("someone else's job is not found", async ({ page }) => {
      await openDay(page, tenant.technician, tenant.name)
      const [all] = await apiGet<[JobPage]>(page, tenant.dispatcher, ['/jobs?pageSize=200'])
      const [mine] = await apiGet<[JobPage]>(page, tenant.technician, ['/jobs?pageSize=200'])
      const own = new Set(mine.items.map((item) => item.id))
      const foreign = all.items.find((item) => !own.has(item.id))
      if (!foreign) throw new Error('Seed needs a job of another technician')
      await page.goto(`/field/jobs/${foreign.id}`)
      await expect(page.getByRole('heading', { name: 'Nalog nije pronađen' })).toBeVisible()
    })

    test('moves between days', async ({ page }) => {
      await openDay(page, tenant.technician, tenant.name)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Danas')
      await page.getByRole('button', { name: 'Sljedeći dan' }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')
      await page.getByRole('button', { name: 'Danas', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Danas')
    })
  })
}
