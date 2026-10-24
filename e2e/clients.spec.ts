import { expect, type Locator, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface ClientSummary {
  id: string
  name: string
  openJobsCount: number
}
interface Client {
  id: string
  name: string
  contacts: { name: string; phone?: string | null }[]
  locations: {
    id: string
    street: string
    address?: string
    accessCodes?: string | null
    hasAccessCodes?: boolean
  }[]
}
interface AssetType {
  id: string
  name: string
}
interface Definition {
  label: string
  type: string
  required: boolean
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
})

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A label as shown: required fields end with a visual `*`. */
const labelled = (label: string) => new RegExp(`^${escape(label)}\\*?$`)

async function signInToOffice(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/')
  await expectSignedInAs(page, tenantName)
}

/** Fills the tenant's required custom fields, whatever their types. */
async function fillRequired(scope: Locator, definitions: Definition[]) {
  for (const definition of definitions.filter((d) => d.required)) {
    const input = scope.getByLabel(labelled(definition.label))
    if (definition.type === 'select') await input.selectOption({ index: 1 })
    else if (definition.type === 'multiselect')
      await scope
        .getByRole('group', { name: definition.label })
        .getByRole('checkbox')
        .first()
        .check()
    else if (definition.type === 'number') await input.fill('4')
    else if (definition.type === 'date') await input.fill('2026-12-01')
    else if (definition.type !== 'checkbox') await input.fill('E2E')
  }
}

/** The tenant's client with the most open jobs (so it can't be deleted). */
async function busyClient(page: Page, email: string) {
  const [list] = await apiGet<[{ items: ClientSummary[] }]>(page, email, ['/clients?pageSize=200'])
  const client = [...list.items].sort((a, b) => b.openJobsCount - a.openJobsCount)[0]
  if (!client || client.openJobsCount === 0) throw new Error('Seed needs a client with open jobs')
  return client
}

const sheet = (page: Page) => page.getByRole('dialog')

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('finds a client, edits it and adds a contact', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher, tenant.name)
      const client = await busyClient(page, tenant.dispatcher)

      await page.getByRole('link', { name: 'Klijenti' }).click()
      await page.getByLabel('Pretraži klijente').fill(client.name)
      await expect(page).toHaveURL(/q=/)
      await page
        .getByTestId('client-row')
        .filter({ hasText: client.name })
        .getByRole('link')
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(client.name)

      await page.getByRole('button', { name: 'Uredi', exact: true }).click()
      await sheet(page).getByRole('button', { name: 'Dodaj kontakt' }).click()
      const added = sheet(page).getByTestId('contact').last()
      await added.getByLabel(labelled('Ime')).fill('Novi kontakt E2E')
      await added.getByLabel('Telefon').fill('091 765 4321')
      await sheet(page).getByRole('button', { name: 'Spremi klijenta' }).click()
      await expect(sheet(page)).toBeHidden()
      await expect(page.getByText('Klijent je spremljen.')).toBeVisible()

      const contacts = page.getByRole('region', { name: 'Kontakti' })
      await expect(contacts).toContainText('Novi kontakt E2E')
      await expect(contacts).toContainText('091 765 4321')
      const [after] = await apiGet<[Client]>(page, tenant.dispatcher, [`/clients/${client.id}`])
      expect(after.contacts.map((contact) => contact.name)).toContain('Novi kontakt E2E')
    })

    test('a new location with access codes: masked, and kept when edited unrevealed', async ({
      page,
    }) => {
      await signInToOffice(page, tenant.dispatcher, tenant.name)
      const client = await busyClient(page, tenant.dispatcher)
      const [locationFields] = await apiGet<[Definition[]]>(page, tenant.dispatcher, [
        '/custom-fields?entity=location',
      ])
      await page.goto(`/clients/${client.id}`)

      await page.getByRole('button', { name: 'Dodaj lokaciju' }).click()
      await sheet(page).getByLabel(labelled('Ulica i kućni broj')).fill('Testna ulica 9')
      await sheet(page).getByLabel(labelled('Mjesto')).fill('Testgrad')
      await sheet(page).getByLabel('Pristupne šifre').fill('4711#')
      await fillRequired(sheet(page), locationFields)
      await sheet(page).getByRole('button', { name: 'Spremi lokaciju' }).click()
      await expect(sheet(page)).toBeHidden()

      const card = page.getByTestId('location-card').filter({ hasText: 'Testna ulica 9' })
      await expect(card).toBeVisible()
      await expect(card).not.toContainText('4711#')
      await card.getByRole('button', { name: 'Prikaži: Pristupne šifre' }).click()
      await expect(card).toContainText('4711#')

      // Edit something else; the codes were never revealed in the form
      await card.getByRole('button', { name: /^Uredi lokaciju/ }).click()
      await sheet(page).getByLabel('Naziv lokacije').fill('Skladište E2E')
      await sheet(page).getByRole('button', { name: 'Spremi lokaciju' }).click()
      await expect(sheet(page)).toBeHidden()
      await expect(card).toContainText('Skladište E2E')

      const [after] = await apiGet<[Client]>(page, tenant.dispatcher, [`/clients/${client.id}`])
      const stored = after.locations.find((location) => location.street === 'Testna ulica 9')
      expect(stored?.accessCodes).toBe('4711#')
    })

    test("adds equipment of one of the tenant's types with its fields", async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher, tenant.name)
      const client = await busyClient(page, tenant.dispatcher)
      const [assetTypes] = await apiGet<[AssetType[]]>(page, tenant.dispatcher, ['/asset-types'])
      const assetType = [...assetTypes].sort((a, b) => a.name.localeCompare(b.name))[0]
      if (!assetType) throw new Error('Seed needs an asset type')
      const [typeFields] = await apiGet<[Definition[]]>(page, tenant.dispatcher, [
        `/custom-fields?entity=asset&assetTypeId=${assetType.id}`,
      ])
      await page.goto(`/clients/${client.id}`)

      const card = page.getByTestId('location-card').first()
      await card.getByRole('button', { name: /^Dodaj opremu na lokaciju/ }).click()
      await sheet(page).getByLabel(labelled('Vrsta opreme')).selectOption({ label: assetType.name })
      await sheet(page).getByLabel('Proizvođač').fill('E2E Proizvođač')
      await sheet(page).getByLabel('Model').fill('X-1')
      for (const definition of typeFields) {
        await expect(sheet(page).getByText(definition.label).first()).toBeVisible()
      }
      await fillRequired(sheet(page), typeFields)
      await sheet(page).getByRole('button', { name: 'Spremi opremu' }).click()
      await expect(sheet(page)).toBeHidden()
      await expect(
        card.getByTestId('asset-item').filter({ hasText: 'E2E Proizvođač X-1' }),
      ).toBeVisible()
    })

    test('a client with open jobs cannot be deleted', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher, tenant.name)
      const client = await busyClient(page, tenant.dispatcher)
      await page.goto(`/clients/${client.id}`)
      await page.getByRole('button', { name: 'Obriši', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Obriši klijenta' }).click()
      await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
        'Klijent ima otvorene naloge i ne može se obrisati.',
      )
      await expect(page).toHaveURL(`/clients/${client.id}`)
    })

    test('a new client, then a job for it from its page', async ({ page }) => {
      await signInToOffice(page, tenant.dispatcher, tenant.name)
      const [clientFields, locationFields] = await apiGet<[Definition[], Definition[]]>(
        page,
        tenant.dispatcher,
        ['/custom-fields?entity=client', '/custom-fields?entity=location'],
      )
      await page.goto('/clients')
      await page.getByRole('link', { name: 'Novi klijent' }).click()
      await expect(page).toHaveURL('/clients/new')

      await page.getByLabel(labelled('Ime i prezime')).fill('Klijent E2E')
      await page.getByTestId('contact').getByLabel(labelled('Ime')).fill('Klijent E2E')
      await page.getByTestId('contact').getByLabel('Telefon').fill('099 111 2233')
      await page.getByLabel(labelled('Ulica i kućni broj')).fill('Nova 1')
      await page.getByLabel(labelled('Mjesto')).fill('Zagreb')
      await fillRequired(page.locator('form'), [...clientFields, ...locationFields])
      await page.getByRole('button', { name: 'Spremi klijenta' }).click()

      await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Klijent E2E')
      await expect(page.getByTestId('location-card')).toContainText('Nova 1, Zagreb')

      await page.getByRole('link', { name: 'Novi nalog' }).last().click()
      await expect(page).toHaveURL(/\/jobs\/new\?clientId=/)
      await expect(page.getByRole('region', { name: 'Klijent' })).toContainText('Klijent E2E')
      // Its only location is chosen by itself
      await expect(
        page.getByRole('region', { name: 'Lokacija' }).getByRole('radio', { name: /Nova 1/ }),
      ).toBeChecked()
    })
  })
}
