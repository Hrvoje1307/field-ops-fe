import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

interface Named {
  id: string
  name: string
}
interface Depot extends Named {
  address: string
  closesAt: string
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

async function openSection(page: Page, owner: string, tenantName: string, link: string) {
  await signIn(page, owner)
  await expectSignedInAs(page, tenantName)
  await page.getByRole('link', { name: 'Postavke' }).click()
  await page
    .getByRole('navigation', { name: 'Odjeljci postavki' })
    .getByRole('link', { name: link })
    .click()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('skills: add, rename, delete', async ({ page }) => {
      await openSection(page, tenant.owner, tenant.name, 'Vještine')
      const list = page.getByRole('list', { name: 'Popis vještina' })
      const [before] = await apiGet<[Named[]]>(page, tenant.owner, ['/skills'])
      await expect(list.getByRole('listitem')).toHaveCount(before.length)

      await page.getByRole('button', { name: 'Dodaj vještinu' }).click()
      await page.getByLabel(/Naziv/).fill('Rad na visini')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Rad na visini')).toBeVisible()

      // A name that exists is refused next to the name
      await page.getByRole('button', { name: 'Dodaj vještinu' }).click()
      await page.getByLabel(/Naziv/).fill('Rad na visini')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Vještina s tim nazivom već postoji.')).toBeVisible()
      await page.getByRole('button', { name: 'Odustani' }).click()

      await page.getByRole('button', { name: 'Uredi: Rad na visini' }).click()
      await page.getByLabel(/Naziv/).fill('Rad u skučenom prostoru')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Rad u skučenom prostoru')).toBeVisible()
      await expect(list.getByText('Rad na visini')).toHaveCount(0)

      await page.getByRole('button', { name: 'Obriši: Rad u skučenom prostoru' }).click()
      await page.getByRole('button', { name: 'Obriši vještinu' }).click()
      // While the dialog is open the page is hidden from the accessibility tree: wait for it
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(list.getByText('Rad u skučenom prostoru')).toHaveCount(0)
      const [after] = await apiGet<[Named[]]>(page, tenant.owner, ['/skills'])
      expect(after.map((skill) => skill.name)).toEqual(before.map((skill) => skill.name))
    })

    test('depots: add one, change its hours, and a used one cannot be deleted', async ({
      page,
    }) => {
      await openSection(page, tenant.owner, tenant.name, 'Skladišta')
      const list = page.getByRole('list', { name: 'Popis skladišta' })
      const [before] = await apiGet<[Depot[]]>(page, tenant.owner, ['/depots'])
      await expect(list.getByRole('listitem')).toHaveCount(before.length)

      await page.getByRole('button', { name: 'Dodaj skladište' }).click()
      await page.getByLabel(/Naziv/).fill('Pomoćno skladište')
      await page.getByLabel(/Adresa/).fill('Pomoćna ulica 5')
      await page.getByLabel(/Radno vrijeme do/).fill('15:30')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Pomoćna ulica 5 · 07:00–15:30')).toBeVisible()

      await page.getByRole('button', { name: 'Uredi: Pomoćno skladište' }).click()
      await page.getByLabel(/Radno vrijeme do/).fill('16:00')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Pomoćna ulica 5 · 07:00–16:00')).toBeVisible()

      // The depot technicians start from stays
      const used = before[0]
      await page.getByRole('button', { name: `Obriši: ${used?.name ?? ''}` }).click()
      await page.getByRole('button', { name: 'Obriši skladište' }).click()
      await expect(page.getByText(/Monteri još kreću iz ovog skladišta/)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(list.getByText(used?.name ?? '')).toBeVisible()

      await page.getByRole('button', { name: 'Obriši: Pomoćno skladište' }).click()
      await page.getByRole('button', { name: 'Obriši skladište' }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(list.getByText('Pomoćno skladište')).toHaveCount(0)
    })

    test('equipment types: add one, and a type with equipment cannot be deleted', async ({
      page,
    }) => {
      await openSection(page, tenant.owner, tenant.name, 'Vrste opreme')
      const list = page.getByRole('list', { name: 'Popis vrsta opreme' })
      const [before] = await apiGet<[Named[]]>(page, tenant.owner, ['/asset-types'])
      await expect(list.getByRole('listitem')).toHaveCount(before.length)

      await page.getByRole('button', { name: 'Dodaj vrstu opreme' }).click()
      await page.getByLabel(/Naziv/).fill('Nova vrsta')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Nova vrsta')).toBeVisible()

      const used = before[0]
      await page.getByRole('button', { name: `Obriši: ${used?.name ?? ''}` }).click()
      await page.getByRole('button', { name: 'Obriši vrstu' }).click()
      await expect(page.getByText(/Oprema te vrste još postoji/)).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Obriši: Nova vrsta' }).click()
      await page.getByRole('button', { name: 'Obriši vrstu' }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(list.getByText('Nova vrsta')).toHaveCount(0)
    })
  })
}
