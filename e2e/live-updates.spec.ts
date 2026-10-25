import { expect, type Page, test } from '@playwright/test'

import { apiGet, apiPost, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface JobSummary {
  id: string
  title: string
  number: string
  status: string
}
interface Board {
  unassigned: JobSummary[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

const today = (page: Page) =>
  page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
  )

/** A job nobody has yet, from the queue of today's board. */
async function queuedJob(page: Page, email: string): Promise<JobSummary> {
  const [board] = await apiGet<[Board]>(page, email, [`/dispatch/board?date=${await today(page)}`])
  const job = board.unassigned.find((candidate) => candidate.status === 'new')
  if (!job) throw new Error('Seed needs a queued job')
  return job
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the board follows a change someone else makes, without a reload', async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 })
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const queue = page.getByTestId('queue').getByTestId('board-job')
      const job = await queuedJob(page, tenant.dispatcher)
      await expect(queue.filter({ hasText: job.title })).toBeVisible()
      const before = await queue.count()

      // The owner, in another session, cancels it
      const cancelled = await apiPost(page, tenant.owner, `/jobs/${job.id}/transition`, {
        to: 'cancelled',
        note: 'Test',
      })
      expect(cancelled.status).toBe(200)

      await expect(queue).toHaveCount(before - 1)
      await expect(queue.filter({ hasText: job.title })).toHaveCount(0)
    })

    test('a job’s own page follows a change of its status', async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 })
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const job = await queuedJob(page, tenant.dispatcher)
      await page.goto(`/jobs/${job.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(job.title)
      await expect(page.locator('main header [data-status]')).not.toContainText('Otkazan')

      await apiPost(page, tenant.owner, `/jobs/${job.id}/transition`, {
        to: 'cancelled',
        note: 'Test',
      })
      await expect(page.locator('main header [data-status]')).toContainText('Otkazan')
    })

    test('after the connection is cut, the screen still gets what changed', async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 })
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const queue = page.getByTestId('queue').getByTestId('board-job')
      const job = await queuedJob(page, tenant.dispatcher)
      await expect(queue.filter({ hasText: job.title })).toBeVisible()

      // The hub is gone for a moment: the change is made while the page cannot hear it
      await page.evaluate(() => {
        ;(window as unknown as { __fieldopsDropHub: (ms: number) => void }).__fieldopsDropHub(1500)
      })
      await apiPost(page, tenant.owner, `/jobs/${job.id}/transition`, {
        to: 'cancelled',
        note: 'Test',
      })
      await expect(queue.filter({ hasText: job.title })).toHaveCount(0)
    })

    test('a technician’s phone gets a job the office gives them, and is told so', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL('/field')
      await expectSignedInAs(page, tenant.name)
      const cards = page.getByTestId('field-job')
      await expect(cards.first()).toBeVisible()
      const before = await cards.count()

      const job = await queuedJob(page, tenant.owner)
      const [me] = await apiGet<[{ technicianId: string }]>(page, tenant.technician, ['/me'])
      const assigned = await apiPost(page, tenant.owner, `/jobs/${job.id}/assign`, {
        technicianIds: [me.technicianId],
        scheduledDate: await today(page),
      })
      expect(assigned.status).toBe(200)

      await expect(cards).toHaveCount(before + 1)
      await expect(cards.filter({ hasText: job.title })).toBeVisible()
      await expect(page.getByText('Raspored je promijenjen.')).toBeVisible()
    })
  })
}
