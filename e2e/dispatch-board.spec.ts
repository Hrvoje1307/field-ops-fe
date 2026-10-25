import { expect, type Page, test } from '@playwright/test'

import {
  apiGet,
  apiPost,
  drag,
  expectSignedInAs,
  nextWorkday,
  resetMock,
  signIn,
  TENANTS,
} from './support'

interface JobSummary {
  id: string
  number: string
  title: string
  status: string
  jobType: { id: string }
  locked: boolean
  requiredPeople: number
  technicians: { id: string }[]
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
interface Board {
  columns: {
    technician: { id: string; fullName: string }
    isWorkingDay: boolean
    jobs: JobSummary[]
  }[]
  unassigned: JobSummary[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
})

const queue = (page: Page) => page.getByTestId('queue')
const column = (page: Page, name: string) => page.getByRole('region', { name })
const handleOf = (page: Page, number: string) =>
  page.getByRole('button', { name: `Povuci nalog ${number}` })

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('a queued job is dropped on a technician, moved to the top of the day, and put back', async ({
      page,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expect(page).toHaveURL('/')
      await expectSignedInAs(page, tenant.name)
      const date = await nextWorkday(page)
      await page.goto(`/?date=${date}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')

      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${date}`,
      ])
      const job = board.unassigned.find(
        (candidate) =>
          candidate.status === 'new' && candidate.requiredPeople === 1 && !candidate.locked,
      )
      const target = board.columns.find((c) => c.isWorkingDay && c.jobs.length > 0)
      if (!job || !target)
        throw new Error('Seed needs a queued job and a technician with a job the next working day')
      const own = column(page, target.technician.fullName)

      // Queue → technician
      await drag(page, handleOf(page, job.number), own.locator('ul'))
      await expect(page.getByText(`Nalog ${job.number} je zakazan.`)).toBeVisible()
      const card = own.getByTestId('board-job').filter({ hasText: job.title })
      await expect(card).toBeVisible()
      await expect(queue(page).getByTestId('board-job').filter({ hasText: job.title })).toHaveCount(
        0,
      )
      const [saved] = await apiGet<[{ technicians: { id: string }[]; scheduledDate: string }]>(
        page,
        tenant.dispatcher,
        [`/jobs/${job.id}`],
      )
      expect(saved.technicians.map((technician) => technician.id)).toEqual([target.technician.id])
      expect(saved.scheduledDate).toBe(date)

      // Within the day: above the technician's first card
      const first = own.getByTestId('board-job').first()
      await drag(page, handleOf(page, job.number), first, 'top')
      await expect(own.getByTestId('board-job').first()).toContainText(job.title)
      const [after] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${date}`,
      ])
      expect(after.columns.find((c) => c.technician.id === target.technician.id)?.jobs[0]?.id).toBe(
        job.id,
      )

      // Back to the queue
      await drag(page, handleOf(page, job.number), queue(page).locator('ul'))
      await expect(page.getByText(`Nalog ${job.number} je vraćen među nezakazane.`)).toBeVisible()
      await expect(
        queue(page).getByTestId('board-job').filter({ hasText: job.title }),
      ).toBeVisible()
      const [back] = await apiGet<[{ status: string; technicians: unknown[] }]>(
        page,
        tenant.dispatcher,
        [`/jobs/${job.id}`],
      )
      expect(back.status).toBe('new')
      expect(back.technicians).toHaveLength(0)
    })

    test('a job with an agreed time keeps it when dragged, and the board warns when the order disagrees', async ({
      page,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const date = await nextWorkday(page)
      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${date}`,
      ])
      const queued = board.unassigned.filter(
        (candidate) =>
          candidate.status === 'new' && candidate.requiredPeople === 1 && !candidate.locked,
      )
      const target = board.columns.find((c) => c.isWorkingDay)
      const [early, late] = queued
      if (!early || !late || !target) throw new Error('Seed needs two queued jobs and a technician')

      // Two jobs with agreed times, in the order of their times
      const times: [JobSummary, string][] = [
        [early, `${date}T06:00:00Z`],
        [late, `${date}T08:00:00Z`],
      ]
      for (const [index, [job, start]] of times.entries()) {
        const assigned = await apiPost(page, tenant.dispatcher, `/jobs/${job.id}/assign`, {
          technicianIds: [target.technician.id],
          leadTechnicianId: target.technician.id,
          scheduledDate: date,
          scheduledStart: start,
          sequence: index,
        })
        expect(assigned.status).toBe(200)
      }
      await page.goto(`/?date=${date}`)
      const own = column(page, target.technician.fullName)
      const cards = own.getByTestId('board-job')
      const indexOf = async (title: string) =>
        (await cards.allTextContents()).findIndex((text) => text.includes(title))
      await expect(cards.filter({ hasText: late.title })).toBeVisible()
      expect(await indexOf(late.title)).toBeGreaterThan(await indexOf(early.title))

      // The later job is dragged above the earlier one: its time stays, and the board says
      await drag(page, handleOf(page, late.number), cards.filter({ hasText: early.title }), 'top')
      await expect(page.getByText(/zadržava svoj termin/)).toBeVisible()
      await expect
        .poll(async () => (await indexOf(late.title)) < (await indexOf(early.title)))
        .toBe(true)
      const [saved] = await apiGet<[{ scheduledStart: string }]>(page, tenant.dispatcher, [
        `/jobs/${late.id}`,
      ])
      expect(saved.scheduledStart).toBe(`${date}T08:00:00Z`)
    })

    test("dropping on a technician without the job type's skills warns, and still saves", async ({
      page,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await expect(page.getByTestId('queue')).toBeVisible()
      const date = await page.evaluate(() =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
      )
      const [board, technicians, jobTypes] = await apiGet<[Board, Technician[], JobType[]]>(
        page,
        tenant.dispatcher,
        [`/dispatch/board?date=${date}`, '/technicians', '/job-types'],
      )
      // A job anyone may move (queued or on a column) and another technician without one of
      // its job type's skills
      const jobs = [...board.unassigned, ...board.columns.flatMap((c) => c.jobs)].filter(
        (job) =>
          ['new', 'scheduled', 'confirmed', 'on_hold'].includes(job.status) &&
          job.requiredPeople === 1 &&
          !job.locked,
      )
      const pair = jobs
        .flatMap((job) => {
          const required =
            jobTypes.find((type) => type.id === job.jobType.id)?.requiredSkillIds ?? []
          return technicians
            .filter((technician) => technician.isActive)
            .filter((technician) => !job.technicians.some((own) => own.id === technician.id))
            .filter((technician) => required.some((id) => !technician.skillIds.includes(id)))
            .map((technician) => ({ job, technician }))
        })
        .at(0)
      test.skip(!pair, 'No job whose skills a technician lacks in this seed')
      if (!pair) return

      await drag(
        page,
        handleOf(page, pair.job.number),
        column(page, pair.technician.fullName).locator('ul'),
      )
      await expect(
        page.getByText(`${pair.technician.fullName} nema potrebne vještine`),
      ).toBeVisible()
      await expect(
        column(page, pair.technician.fullName)
          .getByTestId('board-job')
          .filter({ hasText: pair.job.title }),
      ).toBeVisible()
      const [saved] = await apiGet<[{ technicians: { id: string }[] }]>(page, tenant.dispatcher, [
        `/jobs/${pair.job.id}`,
      ])
      expect(saved.technicians.map((technician) => technician.id)).toEqual([pair.technician.id])
    })

    test('a locked job cannot be dragged until it is unlocked', async ({ page }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${await page.evaluate(() =>
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date()),
        )}`,
      ])
      const job = board.columns
        .flatMap((c) => c.jobs)
        .find(
          (candidate) =>
            candidate.status === 'scheduled' &&
            candidate.requiredPeople === 1 &&
            candidate.technicians.length === 1 &&
            !candidate.locked,
        )
      if (!job) throw new Error('Seed needs a scheduled job today')

      await expect(handleOf(page, job.number)).toBeVisible()
      await page.getByRole('button', { name: `Zaključaj nalog ${job.number}` }).click()
      await expect(
        page.getByRole('button', { name: `Otključaj nalog ${job.number}` }),
      ).toBeVisible()
      await expect(handleOf(page, job.number)).toHaveCount(0)
      const [locked] = await apiGet<[{ locked: boolean }]>(page, tenant.dispatcher, [
        `/jobs/${job.id}`,
      ])
      expect(locked.locked).toBe(true)

      await page.getByRole('button', { name: `Otključaj nalog ${job.number}` }).click()
      await expect(handleOf(page, job.number)).toBeVisible()
    })

    test('with the keyboard: pick up, move, drop', async ({ page }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const date = await nextWorkday(page)
      await page.goto(`/?date=${date}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sutra')
      const [board] = await apiGet<[Board]>(page, tenant.dispatcher, [
        `/dispatch/board?date=${date}`,
      ])
      const job = board.unassigned.find(
        (candidate) =>
          candidate.status === 'new' && candidate.requiredPeople === 1 && !candidate.locked,
      )
      if (!job) throw new Error('Seed needs a queued job')

      await handleOf(page, job.number).focus()
      // The screen reader announcements say where the card is; wait for them so each key
      // finds the picked-up card (as a person would)
      const said = page.locator('[aria-live]').first()
      await page.keyboard.press('Space')
      await expect(said).toContainText('je iznad: Nezakazano')
      await page.keyboard.press('ArrowRight')
      await expect(said).toHaveText(/je iznad: (?!Nezakazano)/)
      await page.keyboard.press('Space')
      await expect(page.getByText(`Nalog ${job.number} je zakazan.`)).toBeVisible()
      await expect(queue(page).getByTestId('board-job').filter({ hasText: job.title })).toHaveCount(
        0,
      )
      const [saved] = await apiGet<[{ technicians: unknown[]; scheduledDate: string }]>(
        page,
        tenant.dispatcher,
        [`/jobs/${job.id}`],
      )
      expect(saved.technicians).toHaveLength(1)
      expect(saved.scheduledDate).toBe(date)
    })
  })
}
