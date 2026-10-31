import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

interface JobType {
  id: string
  name: string
  isActive: boolean
  defaultDurationMin: number
  requiredSkillIds: string[]
  checklistTemplateId: string | null
}
interface Skill {
  id: string
  name: string
}
interface Template {
  id: string
  name: string
  items: { label: string; required?: boolean }[]
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
    test('checklists: a template is made, put on a job type, and deleted', async ({ page }) => {
      await openSection(page, tenant.owner, tenant.name, 'Kontrolne liste')
      const list = page.getByRole('list', { name: 'Popis kontrolnih lista' })
      const [before] = await apiGet<[Template[]]>(page, tenant.owner, ['/checklist-templates'])
      await expect(list.getByRole('listitem')).toHaveCount(before.length)

      await page.getByRole('button', { name: 'Dodaj kontrolnu listu' }).click()
      await page.getByLabel(/^Naziv/).fill('Primopredaja')
      await page.getByLabel('Stavka 1').fill('Pokazati klijentu rad')
      await page.getByRole('button', { name: 'Dodaj stavku' }).click()
      await page.getByLabel('Stavka 2').fill('Pospremiti radno mjesto')
      await page.getByLabel('Obavezna').nth(1).check()
      await page.getByRole('button', { name: 'Pomakni stavku 2 gore' }).click()
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(list.getByText('Primopredaja')).toBeVisible()
      await expect(list.getByRole('listitem').filter({ hasText: 'Primopredaja' })).toContainText(
        '2 stavke, od toga obavezne: 1',
      )

      // The order shown is the order kept
      const [after] = await apiGet<[Template[]]>(page, tenant.owner, ['/checklist-templates'])
      const made = after.find((template) => template.name === 'Primopredaja')
      expect(made?.items).toEqual([
        { label: 'Pospremiti radno mjesto', required: true },
        { label: 'Pokazati klijentu rad', required: false },
      ])

      // A job type can use it
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Vrste naloga' })
        .click()
      const types = page.getByRole('list', { name: 'Popis vrsta naloga' })
      await types
        .getByRole('button', { name: /^Uredi: / })
        .first()
        .click()
      await page.getByLabel('Kontrolna lista').selectOption({ label: 'Primopredaja' })
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(types.getByText('Lista: Primopredaja')).toBeVisible()

      // Deleting it takes it off the job type
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Kontrolne liste' })
        .click()
      await list.getByRole('button', { name: 'Obriši: Primopredaja' }).click()
      await page.getByRole('button', { name: 'Obriši listu' }).click()
      // The dialog hides the page behind it from the accessibility tree, so the list below
      // would "have no Primopredaja" while the request is still on its way: wait for the
      // dialog to close (it closes when the API has answered), then look at the list
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(list.getByText('Primopredaja')).toHaveCount(0)
      const [jobTypes] = await apiGet<[JobType[]]>(page, tenant.owner, ['/job-types'])
      expect(jobTypes.some((type) => type.checklistTemplateId === made?.id)).toBe(false)
    })

    test('job types: add one with a skill, deactivate it (no longer offered for jobs), delete it', async ({
      page,
    }) => {
      await openSection(page, tenant.owner, tenant.name, 'Vrste naloga')
      const list = page.getByRole('list', { name: 'Popis vrsta naloga' })
      const [skillList, typesBefore] = await apiGet<[Skill[], JobType[]]>(page, tenant.owner, [
        '/skills',
        '/job-types',
      ])
      await expect(list.getByRole('listitem')).toHaveCount(typesBefore.length)
      const skill = skillList[0]

      await page.getByRole('button', { name: 'Dodaj vrstu naloga' }).click()
      await page.getByLabel(/^Naziv/).fill('Hitna intervencija')
      await page.getByLabel(/Uobičajeno trajanje/).fill('30')
      await page.getByLabel(/Broj ljudi/).fill('2')
      await page.getByLabel(skill?.name ?? '', { exact: true }).check()
      await page.getByRole('button', { name: 'Spremi' }).click()
      const row = list.getByRole('listitem').filter({ hasText: 'Hitna intervencija' })
      await expect(row).toContainText('30 min')
      await expect(row).toContainText('2 osobe')
      await expect(row).toContainText(`Vještine: ${skill?.name ?? ''}`)

      // Offered for a new job while it is active…
      await page.goto('/jobs/new')
      await expect(
        page.getByLabel(/^Vrsta naloga/).locator('option', { hasText: 'Hitna intervencija' }),
      ).toHaveCount(1)

      // …and not once it is deactivated
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Vrste naloga' })
        .click()
      await list.getByRole('button', { name: 'Uredi: Hitna intervencija' }).click()
      await page.getByLabel(/Aktivna/).uncheck()
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(row).toContainText('Neaktivna')
      await page.goto('/jobs/new')
      await expect(
        page.getByLabel(/^Vrsta naloga/).locator('option', { hasText: 'Hitna intervencija' }),
      ).toHaveCount(0)

      // A type that has jobs cannot be deleted; this one has none
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Vrste naloga' })
        .click()
      const used = typesBefore[0]
      await list.getByRole('button', { name: `Obriši: ${used?.name ?? ''}` }).click()
      await page.getByRole('button', { name: 'Obriši vrstu' }).click()
      await expect(page.getByText(/isključite „Aktivna”/)).toBeVisible()
      await page.keyboard.press('Escape')

      await list.getByRole('button', { name: 'Obriši: Hitna intervencija' }).click()
      await page.getByRole('button', { name: 'Obriši vrstu' }).click()
      await expect(list.getByText('Hitna intervencija')).toHaveCount(0)
    })
  })
}
