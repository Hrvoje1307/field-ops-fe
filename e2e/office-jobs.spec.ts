import { expect, type Page, test } from '@playwright/test'

import { apiGet, apiPost, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface JobSummary {
  id: string
  number: string
  title: string
  status: string
}
interface JobPage {
  items: JobSummary[]
  totalCount: number
}
interface Job extends JobSummary {
  version: number
  allowedTransitions: string[]
  cancelReason?: string | null
  location: { address: string }
  locationDetail?: { accessCodes?: string | null }
  customFields: Record<string, unknown>
}
interface Named {
  name: string
}
interface Definition {
  label: string
}

/** The office's default list: open jobs, newest first. */
const OPEN_JOBS =
  '/jobs?status=new,scheduled,confirmed,en_route,on_site,on_hold&sort=-createdAt&page=1&pageSize=50'

const TRANSITION_LABELS: Record<string, string> = {
  new: 'Vrati u nove',
  scheduled: 'Vrati na zakazano',
  confirmed: 'Potvrdi termin',
  en_route: 'Označi: na putu',
  on_site: 'Označi: na lokaciji',
  on_hold: 'Stavi na čekanje',
  invoiced: 'Označi kao fakturiran',
  cancelled: 'Otkaži nalog',
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

async function signInToOffice(page: Page, email: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/')
}

/** Every job of the tenant, in full (the detail has allowedTransitions and version). */
async function allJobs(page: Page, email: string): Promise<Job[]> {
  const [list] = await apiGet<[JobPage]>(page, email, ['/jobs?pageSize=200'])
  return apiGet<Job[]>(
    page,
    email,
    list.items.map((job) => `/jobs/${job.id}`),
  )
}

async function changeStatus(page: Page, label: string) {
  await page.getByRole('button', { name: 'Promijeni status' }).click()
  await page.getByRole('menuitem', { name: label }).click()
}

const headerStatus = (page: Page) => page.locator('main header [data-status]')

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('lists open jobs, filters, searches and opens a job', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher)
      const [open, jobTypes, cancelled] = await apiGet<[JobPage, Named[], JobPage]>(
        page,
        tenant.dispatcher,
        [OPEN_JOBS, '/job-types', '/jobs?status=cancelled&pageSize=50'],
      )

      await page.goto('/jobs')

      const rows = page.getByTestId('job-row')
      await expect(rows).toHaveCount(open.items.length)
      await expect(rows.first()).toContainText(open.items[0]?.title ?? '')
      await expect(page.getByTestId('jobs-range')).toHaveText(
        `1–${String(open.items.length)} od ${String(open.totalCount)}`,
      )

      // The type filter offers this tenant's job types, nothing hardcoded
      const typeOptions = await page.getByLabel('Vrsta').locator('option').allTextContents()
      expect(typeOptions.slice(1).sort()).toEqual(jobTypes.map((jobType) => jobType.name).sort())

      await page.getByLabel('Status').selectOption({ label: 'Otkazan' })
      await expect(page).toHaveURL(/status=cancelled/)
      await expect(rows).toHaveCount(cancelled.items.length)

      await page.getByRole('button', { name: 'Očisti filtre' }).click()
      await expect(page).toHaveURL('/jobs')
      const target = open.items[1]
      if (!target) throw new Error('Seed needs at least two open jobs')
      await page.getByLabel('Pretraži naloge').fill(target.number)
      await expect(page).toHaveURL(new RegExp(`q=${target.number}`))
      await expect(rows).toHaveCount(1)

      await rows.first().getByRole('link').click()
      await expect(page).toHaveURL(`/jobs/${target.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.title)
    })

    test('detail: the job’s own fields, and access codes only on request', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher)
      const jobs = await allJobs(page, tenant.dispatcher)
      const job = jobs.find((candidate) => candidate.locationDetail?.accessCodes)
      const codes = job?.locationDetail?.accessCodes
      if (!job || !codes) throw new Error('Seed needs a job at a location with access codes')
      const [definitions] = await apiGet<[Definition[]]>(page, tenant.dispatcher, [
        '/custom-fields?entity=job',
      ])

      await page.goto(`/jobs/${job.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(job.title)
      const location = page.getByRole('region', { name: 'Lokacija' })
      await expect(location).toContainText(job.location.address)

      expect(await page.evaluate((text) => document.body.innerText.includes(text), codes)).toBe(
        false,
      )
      await location.getByRole('button', { name: 'Prikaži: Pristupne šifre' }).click()
      await expect(location).toContainText(codes)

      const fields = page.getByRole('region', { name: 'Dodatni podaci' })
      expect(definitions.length).toBeGreaterThan(0)
      for (const definition of definitions) {
        await expect(fields.locator('dt', { hasText: definition.label })).toBeVisible()
      }
    })

    test('cancel asks for a reason; track, history and menu follow', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher)
      const jobs = await allJobs(page, tenant.dispatcher)
      const job = jobs.find((candidate) => candidate.allowedTransitions.includes('cancelled'))
      if (!job) throw new Error('Seed needs a job that can be cancelled')

      await page.goto(`/jobs/${job.id}`)
      await page.getByRole('button', { name: 'Promijeni status' }).click()
      const offered = await page.getByRole('menuitem').allTextContents()
      expect(offered).toEqual(
        job.allowedTransitions
          .filter((status) => status !== 'completed')
          .map((status) => TRANSITION_LABELS[status]),
      )
      await page.getByRole('menuitem', { name: 'Otkaži nalog' }).click()

      const dialog = page.getByRole('dialog', { name: 'Otkaži nalog' })
      await dialog.getByRole('button', { name: 'Otkaži nalog' }).click()
      await expect(dialog.getByText('Upišite razlog.')).toBeVisible()
      await dialog.getByLabel('Razlog').fill('Klijent je odustao.')
      await dialog.getByRole('button', { name: 'Otkaži nalog' }).click()
      await expect(dialog).toBeHidden()

      await expect(page.getByText('Status naloga: Otkazan.')).toBeVisible()
      await expect(headerStatus(page)).toHaveText('Otkazan')
      await expect(page.getByTestId('off-track')).toContainText(
        'Razlog otkazivanja: Klijent je odustao.',
      )
      await expect(page.getByTestId('job-history').getByRole('listitem').first()).toContainText(
        'Klijent je odustao.',
      )

      const [after] = await apiGet<[Job]>(page, tenant.dispatcher, [`/jobs/${job.id}`])
      expect(after).toMatchObject({ status: 'cancelled', cancelReason: 'Klijent je odustao.' })
      await page.getByRole('button', { name: 'Promijeni status' }).click()
      expect(await page.getByRole('menuitem').allTextContents()).toEqual(
        after.allowedTransitions.map((status) => TRANSITION_LABELS[status]),
      )
    })

    test('409: a change made elsewhere is picked up and the user can retry', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher)
      const jobs = await allJobs(page, tenant.dispatcher)
      const job = jobs.find(
        (candidate) =>
          candidate.status === 'scheduled' &&
          candidate.allowedTransitions.includes('confirmed') &&
          candidate.allowedTransitions.includes('cancelled'),
      )
      if (!job) throw new Error('Seed needs a scheduled job')
      await page.goto(`/jobs/${job.id}`)
      await expect(headerStatus(page)).toHaveText('Zakazan')

      // Someone else confirms the job; this page still has the old version
      const elsewhere = await apiPost(page, tenant.owner, `/jobs/${job.id}/transition`, {
        to: 'confirmed',
        version: job.version,
      })
      expect(elsewhere.status).toBe(200)

      await changeStatus(page, 'Otkaži nalog')
      const dialog = page.getByRole('dialog', { name: 'Otkaži nalog' })
      await dialog.getByLabel('Razlog').fill('Klijent je odustao.')
      await dialog.getByRole('button', { name: 'Otkaži nalog' }).click()

      await expect(
        page.getByText('Nalog je u međuvremenu promijenjen. Prikazani su najnoviji podaci.'),
      ).toBeVisible()
      await expect(dialog.getByRole('alert')).toContainText(
        'Provjerite podatke i pokušajte ponovno.',
      )
      await expect(headerStatus(page)).toHaveText('Potvrđen')
      await expect(dialog.getByLabel('Razlog')).toHaveValue('Klijent je odustao.')

      await dialog.getByRole('button', { name: 'Otkaži nalog' }).click()
      await expect(dialog).toBeHidden()
      await expect(headerStatus(page)).toHaveText('Otkazan')
    })

    test('a technician cannot open an office job page', async ({ page }) => {
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL('/field')
      const [list] = await apiGet<[JobPage]>(page, tenant.dispatcher, ['/jobs?pageSize=1'])
      await page.goto(`/jobs/${list.items[0]?.id ?? 'missing'}`)
      await expect(page).toHaveURL('/field')
    })
  })
}
