import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface JobSummary {
  id: string
  number: string
  title: string
  status: string
  jobType: { id: string }
}
interface Board {
  date: string
  columns: { technician: { id: string; fullName: string }; jobs: JobSummary[] }[]
  unassigned: JobSummary[]
}
interface Technician {
  id: string
  fullName: string
  isActive: boolean
  skillIds: string[]
}
interface JobType {
  id: string
  requiredSkillIds: string[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
})

async function openBoard(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/')
  await expectSignedInAs(page, tenantName)
}

const queue = (page: Page) => page.getByTestId('queue')
const column = (page: Page, name: string) => page.getByRole('region', { name })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Termin naloga' })

/** Today in the tenant zone (both mock tenants are in Europe/Zagreb). */
const todayInZagreb = (page: Page) =>
  page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
  )

async function tomorrowOnBoard(page: Page) {
  const today = await todayInZagreb(page)
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test("the board shows this tenant's technicians and today's jobs", async ({ page }) => {
      await openBoard(page, tenant.dispatcher, tenant.name)
      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${await todayInZagreb(page)}`,
      ])
      await expect(page.getByTestId('technician-column')).toHaveCount(board.columns.length)
      for (const { technician, jobs } of board.columns) {
        const own = column(page, technician.fullName)
        await expect(own.getByTestId('board-job')).toHaveCount(jobs.length)
        for (const job of jobs) await expect(own).toContainText(job.title)
      }
      await expect(queue(page).getByTestId('board-job')).toHaveCount(board.unassigned.length)
    })

    test('schedules a queued job, changes its time, then takes it off the schedule', async ({
      page,
    }) => {
      await openBoard(page, tenant.dispatcher, tenant.name)
      const date = await tomorrowOnBoard(page)
      await page.goto(`/?date=${date}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')
      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${date}`,
      ])
      const job = board.unassigned.find((candidate) => candidate.status === 'new')
      const technician = board.columns[0]?.technician
      if (!job || !technician) throw new Error('Seed needs a queued job and a technician')

      await queue(page)
        .getByRole('button', { name: `Zakaži nalog ${job.number}` })
        .click()
      await panel(page).getByRole('checkbox', { name: technician.fullName }).check()
      await panel(page).getByLabel('Početak').fill('10:00')
      await panel(page).getByRole('button', { name: 'Spremi termin' }).click()
      await expect(panel(page)).toBeHidden()
      await expect(page.getByText(`Nalog ${job.number} je zakazan.`)).toBeVisible()

      const card = column(page, technician.fullName).getByTestId('board-job').filter({
        hasText: job.title,
      })
      await expect(card).toContainText('10:00')
      await expect(card).toContainText('Zakazan')
      await expect(queue(page)).not.toContainText(job.title)

      // A new time from the job's own page
      await card.getByRole('link', { name: job.title }).click()
      // The board's cards have a button of the same name, and the URL changes before the
      // page does: wait until the job page is what is showing
      await expect(page.getByRole('region', { name: 'Termin' })).toBeVisible()
      await page.getByRole('button', { name: `Promijeni termin naloga ${job.number}` }).click()
      await panel(page).getByLabel('Početak').fill('12:30')
      await panel(page).getByRole('button', { name: 'Spremi termin' }).click()
      await expect(panel(page)).toBeHidden()
      await expect(page.getByRole('region', { name: 'Termin' })).toContainText('12:30')

      await page.getByRole('button', { name: `Promijeni termin naloga ${job.number}` }).click()
      await panel(page).getByRole('button', { name: 'Ukloni iz rasporeda' }).click()
      await expect(panel(page)).toBeHidden()
      await expect(page.locator('main header [data-status]')).toHaveText('Novi')

      await page.goto(`/?date=${date}`)
      await expect(queue(page)).toContainText(job.title)
    })

    test("warns when a technician lacks the job type's skills (doesn't block)", async ({
      page,
    }) => {
      await openBoard(page, tenant.dispatcher, tenant.name)
      const [board, technicians, jobTypes] = await apiGet<[Board, Technician[], JobType[]]>(
        page,
        tenant.dispatcher,
        [`/dispatch/board?date=${await todayInZagreb(page)}`, '/technicians', '/job-types'],
      )
      // A job the dispatcher can schedule (queued or on a column) and an active technician
      // without one of its job type's skills
      const jobs = [...board.unassigned, ...board.columns.flatMap((c) => c.jobs)].filter((job) =>
        ['new', 'scheduled', 'confirmed', 'on_hold'].includes(job.status),
      )
      const pair = jobs
        .flatMap((job) => {
          const required =
            jobTypes.find((type) => type.id === job.jobType.id)?.requiredSkillIds ?? []
          return technicians
            .filter((technician) => technician.isActive)
            .filter((technician) => required.some((id) => !technician.skillIds.includes(id)))
            .map((technician) => ({ job, technician }))
        })
        .at(0)
      test.skip(!pair, 'No job whose skills a technician lacks in this seed')
      if (!pair) return

      await page
        .getByRole('button', {
          name: new RegExp(`^(Zakaži nalog|Promijeni termin naloga) ${pair.job.number}$`),
        })
        .click()
      await panel(page).getByRole('checkbox', { name: pair.technician.fullName }).check()
      await expect(panel(page).getByTestId('schedule-warnings')).toContainText(
        `${pair.technician.fullName} nema potrebne vještine`,
      )
      await expect(panel(page).getByRole('button', { name: 'Spremi termin' })).toBeEnabled()
    })

    test('moves between days', async ({ page }) => {
      await openBoard(page, tenant.dispatcher, tenant.name)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Danas')
      await page.getByRole('button', { name: 'Sljedeći dan' }).click()
      await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')
      await page.getByRole('button', { name: 'Danas', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Danas')
    })
  })
}
