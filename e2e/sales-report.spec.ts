import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, signOut, TENANTS } from './support'

interface Report {
  from: string
  to: string
  dealsCreated: number
  dealsWon: number
  dealsLost: number
  winRate?: number | null
  stageTimes: { stageId: string; name: string }[]
  lostReasons: { reason: string; count: number }[]
  bySource: { source: string; created: number; won: number }[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const reportOf = async (page: Page, email: string, query: string) =>
  (await apiGet<[Report]>(page, email, [`/sales/reports/summary?${query}`]))[0]

const figure = (page: Page, key: string) => page.getByTestId(`figure-${key}`)

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the figures are the API’s for the period in the address, and the stage names are the tenant’s', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const query = 'from=2026-01-01&to=2026-12-31'
      const data = await reportOf(page, tenant.owner, query)
      await page.goto('/sales/report?from=2026-01-01&to=2026-12-31')
      await expect(figure(page, 'created')).toContainText(String(data.dealsCreated))
      await expect(figure(page, 'won')).toContainText(String(data.dealsWon))
      await expect(figure(page, 'lost')).toContainText(String(data.dealsLost))
      if (data.winRate == null) {
        await expect(figure(page, 'winRate')).toContainText('Nema zatvorenih')
      }
      const stages = page.getByRole('list', { name: 'Prosječno zadržavanje u fazi' })
      for (const stage of data.stageTimes) {
        await expect(stages.getByText(stage.name, { exact: true })).toBeVisible()
      }
      const sources = page.getByRole('list', { name: 'Izvori prilika' })
      for (const row of data.bySource) {
        await expect(sources).toContainText(
          `nove ${String(row.created)}, dobivene ${String(row.won)}`,
        )
      }
    })

    test('a ready-made period and typed dates change the address and what is shown; a reload keeps them', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/sales/report')
      await expect(page.getByRole('button', { name: 'Ovaj mjesec' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await page.getByRole('button', { name: 'Prošli mjesec' }).click()
      // The clock of the tests is 2026-10-28, so last month is September
      await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-30/)
      const september = await reportOf(page, tenant.owner, 'from=2026-09-01&to=2026-09-30')
      if (september.dealsCreated + september.dealsWon + september.dealsLost > 0) {
        await expect(figure(page, 'created')).toContainText(String(september.dealsCreated))
      } else {
        await expect(page.getByText('Nema podataka za ovo razdoblje')).toBeVisible()
      }

      await page.getByLabel('Od', { exact: true }).fill('2026-10-10')
      await page.getByLabel('Do', { exact: true }).fill('2026-10-20')
      await expect(page).toHaveURL(/from=2026-10-10&to=2026-10-20/)
      await expect(page.getByRole('button', { name: 'Ovaj mjesec' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      await page.reload()
      await expect(page.getByLabel('Od', { exact: true })).toHaveValue('2026-10-10')
      await expect(page.getByLabel('Do', { exact: true })).toHaveValue('2026-10-20')

      await page.getByLabel('Do', { exact: true }).fill('2026-10-01')
      await expect(page.getByText('Datum "Od" ne smije biti nakon datuma "Do".')).toBeVisible()
      await expect(page).toHaveURL(/to=2026-10-20/)
    })

    test('the owner can look at one person; the dispatcher has no picker', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [members] = await apiGet<[{ userId: string; fullName: string; role: string }[]]>(
        page,
        tenant.owner,
        ['/users'],
      )
      const person = members.find((m) => m.role === 'dispatcher')
      if (!person) throw new Error('Seed needs a dispatcher')
      const mine = await reportOf(page, tenant.owner, 'from=2026-01-01&to=2026-12-31')
      const theirs = await reportOf(
        page,
        tenant.owner,
        `from=2026-01-01&to=2026-12-31&ownerUserId=${person.userId}`,
      )
      await page.goto('/sales/report?from=2026-01-01&to=2026-12-31')
      await expect(figure(page, 'created')).toContainText(String(mine.dealsCreated))
      await page.getByLabel('Prikaz za').selectOption({ label: person.fullName })
      await expect(page).toHaveURL(new RegExp(`owner=${person.userId}`))
      if (theirs.dealsCreated + theirs.dealsWon + theirs.dealsLost > 0) {
        await expect(figure(page, 'created')).toContainText(String(theirs.dealsCreated))
      } else {
        await expect(page.getByText('Nema podataka za ovo razdoblje')).toBeVisible()
      }

      await signOut(page)
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/sales/report')
      await expect(page.getByRole('region', { name: 'Izvještaj prodaje' })).toBeVisible()
      await expect(page.getByLabel('Prikaz za')).toHaveCount(0)
    })
  })
}
