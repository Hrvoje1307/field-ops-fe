import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

const ENTITIES = [
  { value: 'client', label: 'Klijent' },
  { value: 'location', label: 'Lokacija' },
  { value: 'asset', label: 'Oprema' },
  { value: 'job', label: 'Nalog' },
] as const

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

async function openFields(page: Page, owner: string, tenantName: string) {
  await signIn(page, owner)
  await expectSignedInAs(page, tenantName)
  await page.getByRole('link', { name: 'Postavke' }).click()
  await page
    .getByRole('navigation', { name: 'Odjeljci postavki' })
    .getByRole('link', { name: 'Dodatna polja' })
    .click()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('a new job field shows up in the job form, and is gone once deleted', async ({ page }) => {
      await openFields(page, tenant.owner, tenant.name)
      await page.getByRole('button', { name: 'Nalog', exact: true }).click()
      await expect(page).toHaveURL(/entity=job/)
      const list = page.getByRole('list', { name: 'Popis polja' })

      await page.getByRole('button', { name: 'Dodaj polje' }).click()
      await page.getByLabel(/Naziv polja/).fill('Način plaćanja')
      await expect(page.getByRole('textbox', { name: 'Ključ' })).toHaveValue('nacin_placanja')
      await page.getByLabel(/Vrsta polja/).selectOption({ label: 'Jedan odabir' })
      await page.getByRole('button', { name: 'Dodaj opciju' }).click()
      await page.getByLabel('Opcija 1').fill('Gotovina')
      await page.getByRole('button', { name: 'Dodaj opciju' }).click()
      await page.getByLabel('Opcija 2').fill('Kartica')
      await page.getByLabel('Obavezno polje').check()
      await page.getByRole('button', { name: 'Spremi' }).click()
      const row = list.getByRole('listitem').filter({ hasText: 'Način plaćanja' })
      await expect(row).toContainText('Jedan odabir')
      await expect(row).toContainText('Ključ: nacin_placanja')
      await expect(row).toContainText('obavezno')

      // The job form is built from the definitions: the new field is there
      await page.goto('/jobs/new')
      const select = page.getByLabel(/^Način plaćanja/)
      await expect(select).toBeVisible()
      await expect(select.locator('option', { hasText: 'Kartica' })).toHaveCount(1)

      // And gone when deleted
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Dodatna polja' })
        .click()
      await page.getByRole('button', { name: 'Nalog', exact: true }).click()
      await list.getByRole('button', { name: 'Obriši: Način plaćanja' }).click()
      await page.getByRole('button', { name: 'Obriši polje' }).click()
      await expect(list.getByText('Način plaćanja')).toHaveCount(0)
      await page.goto('/jobs/new')
      await expect(page.getByLabel(/^Način plaćanja/)).toHaveCount(0)
    })

    test('fields can be put in another order, and the key and type stay fixed', async ({
      page,
    }) => {
      await openFields(page, tenant.owner, tenant.name)
      // Whichever kind of record the tenant has at least two fields for
      const found = await apiGet<{ label: string; sortOrder: number }[][]>(
        page,
        tenant.owner,
        ENTITIES.map((entity) => `/custom-fields?entity=${entity.value}`),
      )
      const index = found.findIndex((definitions) => definitions.length >= 2)
      const kind = ENTITIES[index]
      if (!kind) throw new Error('Seed needs a kind of record with two custom fields')
      await page.getByRole('button', { name: kind.label, exact: true }).click()
      const list = page.getByRole('list', { name: 'Popis polja' })
      const rows = list.getByRole('listitem')
      const [first, second] = [...(found[index] ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((definition) => definition.label)
      if (!first || !second) throw new Error('Expected two fields')

      await page
        .getByRole('button', { name: `Pomakni dolje: ${first}` })
        .first()
        .click()
      await expect(rows.nth(0)).toContainText(second)
      await expect(rows.nth(1)).toContainText(first)

      // The order survives a reload
      await page.reload()
      await expect(rows.nth(0)).toContainText(second)

      await rows
        .nth(0)
        .getByRole('button', { name: /^Uredi: / })
        .click()
      await expect(page.getByRole('textbox', { name: 'Ključ' })).toBeDisabled()
      await expect(page.getByLabel(/Vrsta polja/)).toBeDisabled()
    })
  })
}
