import { expect, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface Tenant {
  name: string
  logoAttachmentId: string | null
  logoUrl: string | null
  settings: { requireSignature?: boolean; smsSenderName?: string; jobNumberPrefix?: string }
}

// A 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the owner changes the company and its settings, and the app follows', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)

      await page.getByRole('link', { name: 'Postavke' }).click()
      await expect(page).toHaveURL(/\/settings\/company$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Postavke' })).toBeVisible()
      await expect(page.getByTestId('tenant-usage')).toBeVisible()

      const [before] = await apiGet<[Tenant]>(page, tenant.owner, ['/tenant'])
      const name = page.getByLabel(/Naziv tvrtke/)
      await expect(name).toHaveValue(before.name)
      const requireSignature = page.getByLabel('Za završetak naloga traži potpis klijenta')
      await expect(requireSignature).toBeChecked({ checked: before.settings.requireSignature })

      await name.fill(`${before.name} (nova)`)
      await page.getByLabel('Naziv pošiljatelja SMS-a').fill('NOVO')
      await page.getByLabel('Prefiks broja naloga').fill('ZZ')
      await requireSignature.setChecked(!before.settings.requireSignature)
      await page.getByRole('button', { name: 'Spremi postavke' }).click()

      await expect(page.getByText('Postavke su spremljene.')).toBeVisible()
      // The shell shows the new name without a reload
      await expect(page.getByTestId('tenant-name')).toHaveText(`${before.name} (nova)`)
      await expect(page.getByRole('button', { name: 'Spremi postavke' })).toBeDisabled()

      const [after] = await apiGet<[Tenant]>(page, tenant.owner, ['/tenant'])
      expect(after.name).toBe(`${before.name} (nova)`)
      expect(after.settings).toMatchObject({
        smsSenderName: 'NOVO',
        jobNumberPrefix: 'ZZ',
        requireSignature: !before.settings.requireSignature,
      })

      // Still there after a reload
      await page.reload()
      await expect(page.getByLabel(/Naziv tvrtke/)).toHaveValue(`${before.name} (nova)`)
      await expect(page.getByLabel('Naziv pošiljatelja SMS-a')).toHaveValue('NOVO')
    })

    test('a wrong value is shown next to its input and nothing is sent', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/company')
      await page.getByLabel('OIB').fill('123')
      await page.getByLabel('Poveznica za klijenta vrijedi (sati)').fill('0')
      await page.getByRole('button', { name: 'Spremi postavke' }).click()
      await expect(page.getByText('OIB ima 11 znamenki.')).toBeVisible()
      await expect(page.getByText('Upišite broj sati, najmanje 1.')).toBeVisible()
      await expect(page.getByText('Postavke su spremljene.')).toHaveCount(0)
    })

    test('the logo is uploaded, saved and shown again after a reload', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/company')
      await expect(page.getByText('Logo nije postavljen.')).toBeVisible()

      await page
        .getByTestId('logo-input')
        .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
      await expect(page.getByText(/Logo je prenesen/)).toBeVisible()
      await page.getByRole('button', { name: 'Spremi postavke' }).click()
      await expect(page.getByText('Postavke su spremljene.')).toBeVisible()

      const [saved] = await apiGet<[Tenant]>(page, tenant.owner, ['/tenant'])
      expect(saved.logoAttachmentId).not.toBeNull()
      expect(saved.logoUrl).toMatch(/^data:image\/png/)

      await page.reload()
      await expect(page.getByRole('img', { name: 'Logo tvrtke' })).toBeVisible()
      await page.getByRole('button', { name: 'Ukloni logo' }).click()
      // "Logo nije postavljen." shows at once (the form's own state): the saved company is
      // only there once the API has answered
      const answered = page.waitForResponse(
        (response) => response.request().method() === 'PUT' && response.url().endsWith('/tenant'),
      )
      await page.getByRole('button', { name: 'Spremi postavke' }).click()
      await answered
      await expect(page.getByText('Logo nije postavljen.')).toBeVisible()
      const [removed] = await apiGet<[Tenant]>(page, tenant.owner, ['/tenant'])
      expect(removed.logoAttachmentId).toBeNull()
    })

    test('a dispatcher has no settings in the menu and is sent back to the day', async ({
      page,
    }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await expect(page.getByRole('link', { name: 'Klijenti' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Postavke' })).toHaveCount(0)

      await page.goto('/settings/company')
      await expect(page).not.toHaveURL(/settings/)
      await expect(page.getByTestId('tenant-name')).toHaveText(tenant.name)
    })

    test('a technician does not reach the settings either', async ({ page }) => {
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL(/\/field/)
      await page.goto('/settings/company')
      await expect(page).toHaveURL(/\/field/)
    })
  })
}
