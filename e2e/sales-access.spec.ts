import { expect, type Page, test } from '@playwright/test'

import {
  expectSignedInAs,
  NO_SALES_TENANT,
  openUserMenu,
  resetMock,
  SHARED_DISPATCHER,
  signIn,
  signOut,
  TENANTS,
} from './support'

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

const rail = (page: Page) => page.getByRole('navigation', { name: 'Glavna navigacija' })
const salesTabs = (page: Page) => page.getByRole('navigation', { name: 'Odjeljci prodaje' })

async function switchTenant(page: Page, name: string) {
  await openUserMenu(page)
  await page.getByRole('menuitemradio', { name }).click()
  await expectSignedInAs(page, name)
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the owner and a dispatcher with access see Prodaja and move between its sections', async ({
      page,
    }) => {
      for (const email of [tenant.owner, tenant.dispatcher]) {
        await signIn(page, email)
        await expectSignedInAs(page, tenant.name)
        await rail(page).getByRole('link', { name: 'Prodaja' }).click()
        await expect(page).toHaveURL('/sales')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Danas u prodaji')

        const tabs = salesTabs(page)
        await tabs.getByRole('link', { name: 'Lijevak' }).click()
        await expect(page).toHaveURL('/sales/board')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lijevak')
        await tabs.getByRole('link', { name: 'Inbox' }).click()
        await expect(page).toHaveURL('/sales/inbox')
        await tabs.getByRole('link', { name: 'Izvještaj' }).click()
        await expect(page).toHaveURL('/sales/report')
        await tabs.getByRole('link', { name: 'Danas' }).click()
        await expect(page).toHaveURL('/sales')
        // The rail marks the module while any of its sections is open
        await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toHaveAttribute(
          'data-status',
          'active',
        )

        await page.goto('/sales/deals/00000000-0000-4000-8000-000000000000')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prilika')
        await signOut(page)
      }
    })

    test('a technician does not reach Prodaja', async ({ page }) => {
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL(/\/field/)
      await page.goto('/sales')
      await expect(page).toHaveURL(/\/field/)
      await page.goto('/settings/sales/mailboxes')
      await expect(page).toHaveURL(/\/field/)
    })

    test('the owner takes a dispatcher’s access away and their menu and routes close', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Tim', exact: true })
        .click()
      const row = page
        .getByRole('list', { name: 'Popis članova' })
        .getByRole('listitem')
        .filter({ hasText: tenant.dispatcher })
        .filter({ hasText: 'Prodaja' })
      await row.getByRole('button', { name: /^Uredi člana/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Uredi člana' })
      await dialog.getByLabel('Pristup prodaji').uncheck()
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' && /\/users\/[^/]+$/.test(response.url()),
      )
      await dialog.getByRole('button', { name: 'Spremi' }).click()
      await saved
      await expect(dialog).toHaveCount(0)
      // Their row loses the mark (the other dispatcher of the company keeps hers)
      await expect(
        page
          .getByRole('list', { name: 'Popis članova' })
          .getByRole('listitem')
          .filter({ hasText: tenant.dispatcher }),
      ).not.toContainText('Prodaja')
      await signOut(page)

      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toHaveCount(0)
      await page.goto('/sales/board')
      await expect(page).toHaveURL('/')
      await page.goto('/sales/inbox')
      await expect(page).toHaveURL('/')
    })

    test('the owner’s settings list the sales sections; a dispatcher has no settings at all', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.getByRole('link', { name: 'Postavke' }).click()
      const sections = page.getByRole('navigation', { name: 'Odjeljci postavki' })
      for (const name of [
        'Prodaja: sandučići',
        'Prodaja: faze',
        'Prodaja: pravila praćenja',
        'Prodaja: AI i znanje',
        'Prodaja: isključenja',
      ]) {
        await expect(sections.getByRole('link', { name })).toBeVisible()
      }
      await sections.getByRole('link', { name: 'Prodaja: faze' }).click()
      await expect(page).toHaveURL('/settings/sales/stages')
      await expect(page.getByRole('heading', { level: 1, name: 'Faze prodaje' })).toBeVisible()
      await page.goto('/settings/sales')
      await expect(page).toHaveURL('/settings/sales/mailboxes')
      await signOut(page)

      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/sales/mailboxes')
      await expect(page).toHaveURL('/')
    })

    test('the address the mail provider returns to passes on to the settings with its result', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/sales/settings/mailboxes?connected=01a18f41-8d84-774e-bd75-acf665fed043')
      await expect(page).toHaveURL(
        '/settings/sales/mailboxes?connected=01a18f41-8d84-774e-bd75-acf665fed043',
      )
      await expect(page.getByRole('heading', { level: 1, name: 'Sandučići' })).toBeVisible()
      await page.goto('/sales/settings/mailboxes?error=access_denied')
      await expect(page).toHaveURL('/settings/sales/mailboxes?error=access_denied')
      await page.goto('/sales/settings/mailboxes')
      await expect(page).toHaveURL('/settings/sales/mailboxes')
    })
  })
}

test.describe('a dispatcher with access to several companies', () => {
  test('Prodaja follows the company: in Alarmko yes, in Bura no (no permission), in Čisto no (no module)', async ({
    page,
  }) => {
    await signIn(page, SHARED_DISPATCHER)
    await expectSignedInAs(page, TENANTS[0].name)
    await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toBeVisible()
    await page.goto('/sales')
    await expect(page).toHaveURL('/sales')

    await switchTenant(page, TENANTS[1].name)
    await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toHaveCount(0)
    await page.goto('/sales')
    await expect(page).toHaveURL('/')

    await switchTenant(page, NO_SALES_TENANT.name)
    await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toHaveCount(0)
    await page.goto('/sales/board')
    await expect(page).toHaveURL('/')

    // Back in Alarmko the module is there again
    await switchTenant(page, TENANTS[0].name)
    await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toBeVisible()
  })

  test('a company without the module: the app is what it was (no menu, no sales settings), even for its owner', async ({
    page,
  }) => {
    await signIn(page, NO_SALES_TENANT.owner)
    await expectSignedInAs(page, NO_SALES_TENANT.name)
    await expect(rail(page).getByRole('link', { name: 'Prodaja' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Postavke' }).click()
    const sections = page.getByRole('navigation', { name: 'Odjeljci postavki' })
    await expect(sections.getByRole('link', { name: 'Tim', exact: true })).toBeVisible()
    await expect(sections.getByRole('link', { name: /^Prodaja/ })).toHaveCount(0)
    await page.goto('/settings/sales/stages')
    // (sent to the settings' first section)
    await expect(page).toHaveURL('/settings/company')
    await page.goto('/sales')
    await expect(page).toHaveURL('/')
  })
})

test.describe('mailboxes that need attention', () => {
  const bura = TENANTS[1]

  test('the owner is told which one and gets a link to the mailboxes; Today and the inbox say it', async ({
    page,
  }) => {
    await signIn(page, bura.owner)
    await expectSignedInAs(page, bura.name)
    await page.goto('/sales')
    const banner = page.getByTestId('mailbox-attention')
    await expect(banner).toContainText('Maja Radić (maja.radic@bura.test) javlja grešku.')
    await expect(banner).toContainText('IMAP: prijava nije uspjela')
    await page.goto('/sales/inbox')
    await expect(page.getByTestId('mailbox-attention')).toBeVisible()
    await page
      .getByTestId('mailbox-attention')
      .getByRole('link', { name: 'Otvori sandučiće' })
      .click()
    await expect(page).toHaveURL('/settings/sales/mailboxes')
  })

  test('a dispatcher is told to tell the owner, and there is nothing to press', async ({
    page,
  }) => {
    await signIn(page, bura.dispatcher)
    await expectSignedInAs(page, bura.name)
    await page.goto('/sales')
    const banner = page.getByTestId('mailbox-attention')
    await expect(banner).toContainText('maja.radic@bura.test')
    await expect(banner).toContainText('Javi vlasniku.')
    await expect(banner.getByRole('link')).toHaveCount(0)
    await expect(banner.getByRole('button')).toHaveCount(0)
  })

  test('where all mailboxes work there is no notice', async ({ page }) => {
    await signIn(page, TENANTS[0].owner)
    await expectSignedInAs(page, TENANTS[0].name)
    await page.goto('/sales')
    await expect(page.getByRole('heading', { level: 1, name: 'Danas u prodaji' })).toBeVisible()
    await expect(page.getByTestId('mailbox-attention')).toHaveCount(0)
  })
})
