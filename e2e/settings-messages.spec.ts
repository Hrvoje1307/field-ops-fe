import { expect, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

interface Template {
  id: string
  key: string
  channel: string
  body: string
  isDefault: boolean
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('a message text is written with placeholders and a preview, then taken back to the default', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.getByRole('link', { name: 'Postavke' }).click()
      await page
        .getByRole('navigation', { name: 'Odjeljci postavki' })
        .getByRole('link', { name: 'Poruke klijentima' })
        .click()

      const group = page.getByRole('list', { name: 'Poruke: Potvrda promjene termina' })
      await expect(group.getByRole('listitem')).toHaveCount(1)
      await expect(group).toContainText('Zadano')

      await page
        .getByRole('button', { name: 'Uredi poruku: Potvrda promjene termina · SMS' })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Uredi poruku' })
      const body = dialog.getByLabel(/Tekst poruke/)
      await body.fill('Novi termin: ')
      await dialog.getByRole('button', { name: 'Umetni: datum' }).click()
      await dialog.getByRole('button', { name: 'Umetni: vrijeme od' }).click()
      await expect(body).toHaveValue('Novi termin: {datum}{vrijeme_od}')

      // The preview is the text with sample data, and the SMS count
      await expect(dialog.getByTestId('message-preview')).toHaveText(
        'Novi termin: 15. 10. 2026.09:00',
      )
      await expect(dialog.getByText(/31 znakova · 1 SMS poruka/)).toBeVisible()

      // Č, ć, š, ž, đ take more room, and the dialog says so
      await body.fill('Čekamo vas u šest')
      await expect(dialog.getByText(/zbog kojih stane manje/)).toBeVisible()

      await body.fill('Novi termin: {datum} u {vrijeme_od}.')
      await dialog.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Poruka je spremljena.')).toBeVisible()
      await expect(group).toContainText('Novi termin: {datum} u {vrijeme_od}.')
      await expect(group).not.toContainText('Zadano')

      const [saved] = await apiGet<[Template[]]>(page, tenant.owner, ['/message-templates'])
      expect(saved.find((t) => t.key === 'reschedule_ack')).toMatchObject({
        isDefault: false,
        body: 'Novi termin: {datum} u {vrijeme_od}.',
      })

      // Back to the platform's text
      await page
        .getByRole('button', { name: 'Vrati zadano: Potvrda promjene termina · SMS' })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Vrati zadano' }).click()
      await expect(group).toContainText('Zadano')
      const [after] = await apiGet<[Template[]]>(page, tenant.owner, ['/message-templates'])
      expect(after.find((t) => t.key === 'reschedule_ack')?.isDefault).toBe(true)
    })

    test('an e-mail needs a subject', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/messages')
      await page.getByRole('button', { name: 'Uredi poruku: Izvještaj je spreman · Email' }).click()
      const dialog = page.getByRole('dialog', { name: 'Uredi poruku' })
      await dialog.getByLabel(/Naslov emaila/).fill('')
      await dialog.getByRole('button', { name: 'Spremi' }).click()
      await expect(dialog.getByText('Upišite naslov e-maila.')).toBeVisible()
    })
  })
}
