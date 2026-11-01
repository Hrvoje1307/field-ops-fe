import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

interface Settings {
  aiEnabled: boolean
  tone: string
  replyLanguage: string
  knowledge: string | null
  signature: string | null
  responseSlaHours: number
  digestEnabled: boolean
  digestTime: string
  digestRecipientIds: string[]
  storeNonSalesBodies: boolean
  retentionDays: number | null
  reviewThreshold: number
}
interface Rule {
  id: string
  name: string
  stageId: string | null
  daysWithoutReply: number
  createDraft: boolean
  isActive: boolean
}
interface Exclusion {
  id: string
  pattern: string
  note?: string | null
}
interface Stage {
  id: string
  name: string
  kind: string
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const settingsOf = async (page: Page, email: string) =>
  (await apiGet<[Settings]>(page, email, ['/sales/settings']))[0]

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('AI: tone, language, threshold and knowledge are saved; the digest’s fields stay', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const before = await settingsOf(page, tenant.owner)
      await page.goto('/settings/sales/ai')
      const form = page.getByRole('form', { name: 'AI i znanje' })
      await expect(form).toBeVisible()
      await form.getByLabel('Ton', { exact: true }).selectOption('friendly')
      await form.getByLabel('Jezik odgovora').selectOption('other')
      await form.getByLabel(/Oznaka jezika/).fill('en-GB')
      await form.getByLabel('Prag sigurnosti').fill('55')
      await form.getByLabel('Što AI smije reći').fill('Servis u roku od 3 dana.')
      await expect(form.getByTestId('knowledge-count')).toContainText('24 od 20000 znakova')
      await form.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Postavke su spremljene.')).toBeVisible()
      await expect
        .poll(async () => settingsOf(page, tenant.owner))
        .toMatchObject({
          tone: 'friendly',
          replyLanguage: 'en-GB',
          reviewThreshold: 0.55,
          knowledge: 'Servis u roku od 3 dana.',
          digestTime: before.digestTime,
          digestEnabled: before.digestEnabled,
          storeNonSalesBodies: before.storeNonSalesBodies,
        })
    })

    test('digest: saving it changes neither the knowledge nor the tone', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/sales/ai')
      const ai = page.getByRole('form', { name: 'AI i znanje' })
      await ai.getByLabel('Ton', { exact: true }).selectOption('formal')
      await ai.getByLabel('Što AI smije reći').fill('Cjenik vrijedi do kraja godine.')
      await ai.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Postavke su spremljene.')).toBeVisible()

      await page.getByRole('link', { name: 'Prodaja: dnevni sažetak' }).click()
      const digest = page.getByRole('form', { name: 'Dnevni sažetak' })
      await expect(digest).toBeVisible()
      await digest.getByLabel('Vrijeme slanja').fill('09:30')
      await digest.getByRole('button', { name: 'Spremi' }).click()
      await expect
        .poll(async () => settingsOf(page, tenant.owner))
        .toMatchObject({
          digestTime: '09:30',
          tone: 'formal',
          knowledge: 'Cjenik vrijedi do kraja godine.',
        })
    })

    test('a retention deletes mail: it is said first and saved only after the confirmation', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/sales/ai')
      const form = page.getByRole('form', { name: 'AI i znanje' })
      await form.getByLabel('Obriši sadržaj razgovora nakon (dana)').fill('90')
      await form.getByRole('button', { name: 'Spremi' }).click()
      const dialog = page.getByRole('dialog', { name: 'Spremiti i obrisati sadržaj?' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Odustani' }).click()
      await expect(dialog).toBeHidden()
      expect((await settingsOf(page, tenant.owner)).retentionDays).toBeNull()

      await form.getByRole('button', { name: 'Spremi' }).click()
      await dialog.getByRole('button', { name: 'Spremi i obriši' }).click()
      await expect(dialog).toBeHidden()
      await expect.poll(async () => (await settingsOf(page, tenant.owner)).retentionDays).toBe(90)
    })

    test('follow-up rules: add for a stage of the tenant, edit, delete', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [stages, rules] = await apiGet<[Stage[], Rule[]]>(page, tenant.owner, [
        '/sales/stages',
        '/sales/follow-up-rules',
      ])
      const stage = stages.find((s) => s.kind === 'open')
      if (!stage) throw new Error('Seed needs an open stage')
      await page.goto('/settings/sales/follow-up-rules')
      const list = page.getByRole('list', { name: 'Popis pravila praćenja' })
      await expect(list.getByRole('listitem')).toHaveCount(rules.length)

      await page.getByRole('button', { name: 'Dodaj pravilo' }).click()
      const sheet = page.getByRole('dialog')
      await sheet.getByLabel(/Naziv/).fill('Podsjetnik nakon ponude')
      await sheet.getByLabel('Faza').selectOption({ label: stage.name })
      await sheet.getByLabel(/Radnih dana bez odgovora/).fill('0')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(sheet.getByText('Upišite cijeli broj od 1 do 90.')).toBeVisible()
      await sheet.getByLabel(/Radnih dana bez odgovora/).fill('4')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(sheet).toBeHidden()
      const row = list.getByRole('listitem').filter({ hasText: 'Podsjetnik nakon ponude' })
      await expect(row).toContainText(stage.name)
      await expect(row).toContainText('nakon 4 radnih dana')

      await row.getByRole('button', { name: /^Uredi/ }).click()
      await sheet.getByLabel(/Radnih dana bez odgovora/).fill('7')
      await sheet.getByRole('checkbox', { name: 'Pravilo je aktivno' }).uncheck()
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(sheet).toBeHidden()
      await expect
        .poll(async () => {
          const [all] = await apiGet<[Rule[]]>(page, tenant.owner, ['/sales/follow-up-rules'])
          return all.find((r) => r.name === 'Podsjetnik nakon ponude')
        })
        .toMatchObject({ stageId: stage.id, daysWithoutReply: 7, isActive: false })

      await row.getByRole('button', { name: /^Obriši/ }).click()
      const confirm = page.getByRole('dialog', { name: 'Obrisati pravilo?' })
      await confirm.getByRole('button', { name: 'Obriši pravilo' }).click()
      await expect(confirm).toBeHidden()
      await expect(list.getByRole('listitem')).toHaveCount(rules.length)
    })

    test('exclusions: an address and a domain are added, a wrong pattern is refused, a rule is removed', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [rules] = await apiGet<[Exclusion[]]>(page, tenant.owner, ['/sales/exclusions'])
      await page.goto('/settings/sales/exclusions')
      const list = page.getByRole('list', { name: 'Popis isključenja' })
      await expect(list.getByRole('listitem')).toHaveCount(rules.length)

      await page.getByRole('button', { name: 'Dodaj isključenje' }).click()
      const sheet = page.getByRole('dialog')
      await sheet.getByLabel(/Adresa ili domena/).fill('bilten.hr')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(sheet.getByText(/Upišite adresu \(ime@primjer.hr\)/)).toBeVisible()
      await sheet.getByLabel(/Adresa ili domena/).fill('@bilten.hr')
      await sheet.getByLabel('Napomena').fill('Newsletter')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(sheet).toBeHidden()
      const row = list.getByRole('listitem').filter({ hasText: '@bilten.hr' })
      await expect(row).toContainText('Domena')
      await expect(row).toContainText('Newsletter')

      await row.getByRole('button', { name: /^Obriši/ }).click()
      const confirm = page.getByRole('dialog', { name: 'Ukloniti isključenje?' })
      await confirm.getByRole('button', { name: 'Ukloni isključenje' }).click()
      await expect(confirm).toBeHidden()
      await expect(list.getByRole('listitem')).toHaveCount(rules.length)
    })

    test('a dispatcher has no settings of Prodaja', async ({ page }) => {
      await signIn(page, tenant.dispatcher)
      await expectSignedInAs(page, tenant.name)
      await page.goto('/settings/sales/ai')
      await expect(page).not.toHaveURL(/\/settings/)
      await expect(page.getByRole('form', { name: 'AI i znanje' })).toHaveCount(0)
    })
  })
}
