import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, signOut, TENANTS } from './support'

interface Item {
  reason: string
  dueAt?: string | null
  thread: { id: string; subject: string }
  deal?: { id: string; title: string } | null
  draft?: { id: string; status: string } | null
}
interface Today {
  items: Item[]
  staleDeals?: { id: string; title: string }[]
  needsReviewCount: number
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const rows = (page: Page) => page.getByTestId('today-item')
const today = async (page: Page, email: string, query = '') =>
  (await apiGet<[Today]>(page, email, [`/sales/today${query}`]))[0]

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the list is what the API gives, in its order, with reasons, drafts and the review count', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const data = await today(page, tenant.owner)
      expect(data.items.length).toBeGreaterThan(0)
      await page.goto('/sales')
      await expect(rows(page)).toHaveCount(data.items.length)
      for (const [index, item] of data.items.entries()) {
        const row = rows(page).nth(index)
        await expect(row).toContainText(item.thread.subject)
        const reason = {
          follow_up_due: 'Praćenje je dospjelo',
          unanswered: 'Klijent čeka odgovor',
          stale: 'Prilika miruje',
        }[item.reason]
        await expect(row).toContainText(reason ?? '')
      }
      // Overdue first: the API's order is kept, the label follows the time
      expect(data.needsReviewCount).toBeGreaterThan(0)
      await expect(page.getByText(`Za pregled: ${String(data.needsReviewCount)}`)).toBeVisible()
      if (data.items.some((item) => item.draft)) {
        await expect(page.getByText(/Nacrt je pripremljen|Nacrt se priprema/).first()).toBeVisible()
      }
      for (const deal of data.staleDeals ?? []) {
        await expect(
          page.getByRole('link', { name: `Otvori priliku: ${deal.title}` }).first(),
        ).toBeVisible()
      }
    })

    test('a row opens the conversation with its draft; the review link opens the review card', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const data = await today(page, tenant.owner)
      const withDraft = data.items.find((item) => item.draft) ?? data.items[0]
      if (!withDraft) throw new Error('Seed needs an item')
      await page.goto('/sales')
      await page
        .getByRole('link', { name: `Otvori razgovor: ${withDraft.thread.subject}` })
        .first()
        .click()
      await expect(page).toHaveURL(new RegExp(`/sales/inbox\\?.*thread=${withDraft.thread.id}`))
      await expect(page.getByRole('article', { name: withDraft.thread.subject })).toBeVisible()
      if (withDraft.draft) {
        await expect(page.getByRole('region', { name: 'Nacrt odgovora' }).first()).toBeVisible()
      }
      await page.goto('/sales')
      await page.getByRole('link', { name: 'Pregledaj razgovore' }).click()
      await expect(page).toHaveURL(/\/sales\/inbox\?.*card=review/)
      await expect(page.getByRole('tab', { name: 'Za pregled', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    test('the owner can look at one person; the dispatcher has no picker and the API decides', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [members] = await apiGet<[{ userId: string; fullName: string; role: string }[]]>(
        page,
        tenant.owner,
        ['/users'],
      )
      const person = members.find((m) => m.role === 'dispatcher')
      if (!person) throw new Error('Seed needs a dispatcher')
      const expected = await today(page, tenant.owner, `?ownerUserId=${person.userId}`)
      await page.goto('/sales')
      await expect(rows(page).first()).toBeVisible()
      await page.getByLabel('Prikaz za').selectOption({ label: person.fullName })
      await expect(rows(page)).toHaveCount(expected.items.length)

      await signOut(page)
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      const mine = await today(page, tenant.dispatcher)
      await page.goto('/sales')
      await expect(page.getByLabel('Prikaz za')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(mine.items.length)
    })
  })
}
