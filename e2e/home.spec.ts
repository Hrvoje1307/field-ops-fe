import { expect, test } from '@playwright/test'

test('home page renders in Croatian', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Dobro došli u FieldOps' }),
  ).toBeVisible()
})
