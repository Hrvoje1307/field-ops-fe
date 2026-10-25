import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, nextWorkday, resetMock, signIn, TENANTS } from './support'

interface Member {
  userId: string
  fullName: string
  email: string
  role: string
  isActive: boolean
  technicianId: string | null
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

async function openTeam(page: Page, owner: string, tenantName: string) {
  await signIn(page, owner)
  await expectSignedInAs(page, tenantName)
  await page.getByRole('link', { name: 'Postavke' }).click()
  await page
    .getByRole('navigation', { name: 'Odjeljci postavki' })
    .getByRole('link', { name: 'Tim', exact: true })
    .click()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('the team: members with their roles, yourself marked, a technician’s working data', async ({
      page,
    }) => {
      await openTeam(page, tenant.owner, tenant.name)
      const [members] = await apiGet<[Member[]]>(page, tenant.owner, ['/users'])
      const list = page.getByRole('list', { name: 'Popis članova' })
      await expect(list.getByRole('listitem')).toHaveCount(members.length)

      const owner = members.find((m) => m.email === tenant.owner)
      await expect(
        list.getByRole('listitem').filter({ hasText: owner?.fullName ?? '' }),
      ).toContainText('(vi)')
      const technician = members.find((m) => m.role === 'technician' && m.technicianId)
      const row = list.getByRole('listitem').filter({ hasText: technician?.fullName ?? '' })
      await expect(row).toContainText('Monter')
      await expect(row).toContainText('pon–pet')
    })

    test('a dispatcher who becomes a technician gets working data and a column on the board; deactivated, the column goes', async ({
      page,
    }) => {
      await openTeam(page, tenant.owner, tenant.name)
      const [members] = await apiGet<[Member[]]>(page, tenant.owner, ['/users'])
      const person = members.find((m) => m.email === tenant.dispatcher)
      if (!person) throw new Error('Seed needs a dispatcher')

      await page.getByRole('button', { name: `Uredi člana: ${person.fullName}` }).click()
      await page.getByLabel('Uloga').selectOption({ label: 'Monter' })
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Član je spremljen.')).toBeVisible()

      await page
        .getByRole('button', { name: `Dodaj podatke o monteru: ${person.fullName}` })
        .click()
      await page.getByLabel(/Radi od/).fill('07:00')
      await page.getByLabel(/Radi do/).fill('15:00')
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Podaci o monteru su spremljeni.')).toBeVisible()
      const row = page.getByRole('list', { name: 'Popis članova' }).getByRole('listitem').filter({
        hasText: person.fullName,
      })
      await expect(row).toContainText('07:00–15:00')
      await expect(row).toContainText('pon–pet')

      // The board has a column for them on a working day
      const day = await nextWorkday(page)
      await page.goto(`/?date=${day}`)
      const column = page.getByRole('region', { name: person.fullName })
      await expect(column).toBeVisible()
      await expect(column).toContainText('07:00')

      // Switched off, they are no longer offered
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Tim', exact: true })
        .click()
      await page.getByRole('button', { name: `Podaci o monteru: ${person.fullName}` }).click()
      await page.getByLabel(/Aktivan/).uncheck()
      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Podaci o monteru su spremljeni.')).toBeVisible()
      await page.goto(`/?date=${day}`)
      await expect(page.getByTestId('technician-column').first()).toBeVisible()
      await expect(page.getByRole('region', { name: person.fullName })).toHaveCount(0)
    })

    test('a person is invited, the link is shown, and the invitation can be revoked', async ({
      page,
    }) => {
      await openTeam(page, tenant.owner, tenant.name)
      await page.getByRole('button', { name: 'Pozovi osobu' }).click()
      await page.getByLabel(/Email/).fill('Nova.Osoba@Firma.test')
      await page.getByLabel(/Uloga/).selectOption({ label: 'Dispečer' })
      await page.getByRole('button', { name: 'Pošalji pozivnicu' }).click()
      await expect(page.getByLabel(/Pošaljite osobi ovu poveznicu/)).toHaveValue(/\/invite\?token=/)
      await page.getByRole('button', { name: 'Gotovo' }).click()

      const list = page.getByRole('list', { name: 'Popis pozivnica' })
      const row = list.getByRole('listitem').filter({ hasText: 'nova.osoba@firma.test' })
      await expect(row).toContainText('Dispečer')

      // The same address again is refused next to the address
      await page.getByRole('button', { name: 'Pozovi osobu' }).click()
      await page.getByLabel(/Email/).fill('nova.osoba@firma.test')
      await page.getByRole('button', { name: 'Pošalji pozivnicu' }).click()
      await expect(page.getByText('Ta osoba je već član ili ima otvorenu pozivnicu.')).toBeVisible()
      await page.getByRole('button', { name: 'Odustani' }).click()

      await page.getByRole('button', { name: 'Opozovi pozivnicu: nova.osoba@firma.test' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Opozovi pozivnicu' }).click()
      await expect(list.getByText('nova.osoba@firma.test')).toHaveCount(0)
    })
  })
}
