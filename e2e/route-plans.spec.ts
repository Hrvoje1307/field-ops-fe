import { expect, type Page, test } from '@playwright/test'

import { apiGet, drag, expectSignedInAs, nextWorkday, resetMock, signIn, TENANTS } from './support'

interface JobSummary {
  id: string
  number: string
  title: string
}
interface Plan {
  id: string
  status: string
  routes: { technicianId: string; stops: { jobId: string }[] }[]
  unassigned: { jobId: string }[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
})

async function openDay(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
  const date = await nextWorkday(page)
  await page.goto(`/?date=${date}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')
  return date
}

const optimizeButton = (page: Page) => page.getByRole('button', { name: 'Optimiraj dan' })
const route = (page: Page) => page.getByTestId('plan-route')
const stops = (page: Page) => page.getByTestId('plan-stop')

const [alarmko, bura] = TENANTS

test.describe(alarmko.name, () => {
  test('optimize the day, correct the draft by dragging, publish', async ({ page }) => {
    const date = await openDay(page, alarmko.dispatcher, alarmko.name)

    await optimizeButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Optimiraj rute' })
    await expect(dialog.getByRole('checkbox').first()).toBeChecked()
    await dialog.getByRole('button', { name: 'Napravi plan' }).click()

    // The draft's own page
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sutra')
    await expect(page.getByTestId('plan-status')).toHaveText('Nacrt')
    await expect(stops(page).first()).toBeVisible()
    const planId = page.url().split('/').pop() ?? ''
    const [plan] = await apiGet<[Plan]>(page, alarmko.dispatcher, [`/route-plans/${planId}`])
    expect(plan.status).toBe('draft')
    const planned = plan.routes.flatMap((r) => r.stops.map((stop) => stop.jobId))
    await expect(stops(page)).toHaveCount(planned.length + plan.unassigned.length)

    // Arrival, departure and the drive are shown on the stops
    await expect(page.getByTestId('plan-route').first()).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/)

    // Move one stop to the list of jobs that are not planned
    const first = plan.routes[0]?.stops[0]
    if (!first) throw new Error('Seed needs a planned stop')
    const [board] = await apiGet<[{ unassigned: JobSummary[]; columns: { jobs: JobSummary[] }[] }]>(
      page,
      alarmko.dispatcher,
      [`/dispatch/board?date=${date}`],
    )
    const job = [...board.unassigned, ...board.columns.flatMap((c) => c.jobs)].find(
      (candidate) => candidate.id === first.jobId,
    )
    if (!job) throw new Error('The stop is not on the board')
    await drag(
      page,
      page.getByRole('button', { name: `Povuci nalog ${job.number}` }),
      page.getByTestId('plan-unassigned').locator('ul'),
    )
    await expect(
      page.getByTestId('plan-unassigned').getByTestId('plan-stop').filter({ hasText: job.title }),
    ).toBeVisible()
    await expect
      .poll(async () => {
        const [saved] = await apiGet<[Plan]>(page, alarmko.dispatcher, [`/route-plans/${planId}`])
        return saved.unassigned.some((item) => item.jobId === first.jobId)
      })
      .toBe(true)

    // And back onto a technician's route
    await drag(
      page,
      page.getByRole('button', { name: `Povuci nalog ${job.number}` }),
      route(page).first().locator('ul'),
    )
    await expect(
      route(page).first().getByTestId('plan-stop').filter({ hasText: job.title }),
    ).toBeVisible()

    // Publish
    await page.getByRole('button', { name: 'Objavi plan' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Objavi', exact: true }).click()
    await expect(page.getByText('Plan je objavljen.')).toBeVisible()
    await expect(page.getByTestId('plan-status')).toHaveText('Objavljen')
    await expect(page.getByRole('button', { name: 'Objavi plan' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Povuci nalog ${job.number}` })).toHaveCount(0)

    // The day shows the plan: the jobs are on their technicians' columns
    await page.getByRole('link', { name: 'Natrag na dan' }).click()
    await expect(page.getByTestId('published-plan-banner')).toBeVisible()
    await expect(page.getByTestId('draft-plan-banner')).toHaveCount(0)
    const card = page
      .getByTestId('technician-column')
      .getByTestId('board-job')
      .filter({ hasText: job.title })
    await expect(card).toBeVisible()
    // Publishing schedules new jobs; one the client had confirmed stays confirmed
    await expect(card).toContainText(/Zakazan|Potvrđen/)
  })

  test('the day links to a draft that is waiting', async ({ page }) => {
    await openDay(page, alarmko.dispatcher, alarmko.name)
    await optimizeButton(page).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Napravi plan' }).click()
    await expect(page).toHaveURL(/\/plans\//)
    await page.getByRole('link', { name: 'Natrag na dan' }).click()
    await expect(page.getByTestId('draft-plan-banner')).toBeVisible()
    await page.getByRole('link', { name: 'Pregledaj nacrt' }).click()
    await expect(page.getByTestId('plan-status')).toHaveText('Nacrt')
  })
})

test.describe(bura.name, () => {
  test("optimisation is not in the tenant's plan: the button is off and says why", async ({
    page,
  }) => {
    await openDay(page, bura.dispatcher, bura.name)
    await expect(optimizeButton(page)).toBeDisabled()
    await expect(page.getByText('Optimizacija ruta nije u vašem paketu.')).toBeVisible()
  })
})
