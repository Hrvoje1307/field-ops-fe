import { expect, type Locator, type Page, test } from '@playwright/test'

import { apiGet, resetMock, signIn, TENANTS } from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface Definition {
  key: string
  label: string
  type: string
  required: boolean
  isSensitive: boolean
  options?: { value: string; label: string }[] | null
}
interface AssetType {
  id: string
  name: string
}
interface Client {
  locations: { customFields: Record<string, unknown> }[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A field label as shown: required fields end with a visual `*`. */
const labelled = (label: string) => new RegExp(`^${escape(label)}\\*?$`)

/** The field's input (or group, or masked placeholder) in edit mode, by its label. */
function editField(edit: Locator, definition: Definition): Locator {
  if (definition.type === 'multiselect') return edit.getByRole('group', { name: definition.label })
  return edit
    .getByLabel(labelled(definition.label))
    .or(edit.getByRole('button', { name: `Prikaži: ${definition.label}` }))
}

/** The <dd> with the field's value in read mode. */
const readValue = (read: Locator, label: string) =>
  read
    .locator('dt', { hasText: new RegExp(`^${escape(label)}$`) })
    .locator('xpath=following-sibling::dd[1]')

async function openPreview(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/')
  await page.goto('/dev/custom-fields')
  await expect(page.getByTestId('tenant-name')).toHaveText(tenantName)
  return {
    entity: page.getByLabel('Entitet'),
    edit: page.getByRole('region', { name: 'Uređivanje' }),
    read: page.getByRole('region', { name: 'Prikaz' }),
    check: page.getByRole('button', { name: 'Provjeri' }),
    payload: page.getByTestId('payload'),
  }
}

/** True when the text appears anywhere in the page, including input values. */
const isInPage = (page: Page, text: string) =>
  page.evaluate(
    (needle) =>
      document.body.innerText.includes(needle) ||
      [...document.querySelectorAll('input, textarea, select')].some(
        (control) => (control as HTMLInputElement).value === needle,
      ),
    text,
  )

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('renders every definition from /custom-fields in edit and read mode', async ({ page }) => {
      const preview = await openPreview(page, tenant.owner, tenant.name)
      const [assetTypes] = await apiGet<[AssetType[]]>(page, tenant.owner, ['/asset-types'])
      const scopes = [
        { option: 'Klijent', query: 'entity=client' },
        { option: 'Lokacija', query: 'entity=location' },
        { option: 'Nalog', query: 'entity=job' },
        ...assetTypes.map((type) => ({
          option: `Oprema: ${type.name}`,
          query: `entity=asset&assetTypeId=${type.id}`,
        })),
      ]
      const lists = await apiGet<Definition[][]>(
        page,
        tenant.owner,
        scopes.map((scope) => `/custom-fields?${scope.query}`),
      )

      const types = new Set<string>()
      for (const [index, scope] of scopes.entries()) {
        await preview.entity.selectOption({ label: scope.option })
        const definitions = lists[index] ?? []
        if (definitions.length === 0) {
          await expect(page.getByText('Za ovaj entitet nema prilagođenih polja.')).toBeVisible()
          continue
        }
        for (const definition of definitions) {
          types.add(definition.type)
          await expect(editField(preview.edit, definition), definition.label).toBeVisible()
          await expect(readValue(preview.read, definition.label), definition.label).toBeVisible()
        }
      }
      // The seed gives each tenant every field type
      expect([...types].sort()).toEqual([
        'checkbox',
        'date',
        'multiselect',
        'number',
        'select',
        'text',
        'textarea',
      ])
    })

    test('a required field blocks the check until filled', async ({ page }) => {
      const preview = await openPreview(page, tenant.owner, tenant.name)
      const scopes = ['client', 'location', 'job'] as const
      const lists = await apiGet<Definition[][]>(
        page,
        tenant.owner,
        scopes.map((entity) => `/custom-fields?entity=${entity}`),
      )
      const [assetTypes] = await apiGet<[AssetType[]]>(page, tenant.owner, ['/asset-types'])
      const assetLists = await apiGet<Definition[][]>(
        page,
        tenant.owner,
        assetTypes.map((type) => `/custom-fields?entity=asset&assetTypeId=${type.id}`),
      )
      const candidates = [
        ...scopes.map((entity, index) => ({
          option: { client: 'Klijent', location: 'Lokacija', job: 'Nalog' }[entity],
          definitions: lists[index] ?? [],
        })),
        ...assetTypes.map((type, index) => ({
          option: `Oprema: ${type.name}`,
          definitions: assetLists[index] ?? [],
        })),
      ]
      const target = candidates
        .map(({ option, definitions }) => ({
          option,
          definition: definitions.find(
            (d) => d.required && !d.isSensitive && ['select', 'number', 'text'].includes(d.type),
          ),
        }))
        .find((candidate) => candidate.definition)
      if (!target?.definition) throw new Error('The seed has no required select/number/text field')
      const { definition } = target

      await preview.entity.selectOption({ label: target.option })
      const input = preview.edit.getByLabel(labelled(definition.label))
      if (definition.type === 'select') await input.selectOption('')
      else await input.fill('')
      await preview.check.click()

      await expect(input).toHaveAttribute('aria-invalid', 'true')
      await expect(input).toHaveAccessibleDescription('Obavezno polje.')
      await expect(page.getByText('Podaci su ispravni.')).toHaveCount(0)

      const option = definition.options?.[0]
      if (definition.type === 'select' && option) await input.selectOption({ label: option.label })
      else await input.fill(definition.type === 'number' ? '12,5' : 'Provjera')
      await preview.check.click()

      await expect(page.getByText('Podaci su ispravni.')).toBeVisible()
      const shown =
        definition.type === 'select'
          ? (option?.label ?? '')
          : definition.type === 'number'
            ? '12,5'
            : 'Provjera'
      await expect(readValue(preview.read, definition.label)).toHaveText(shown)
    })

    test('a sensitive value stays out of the page until revealed', async ({ page }) => {
      const preview = await openPreview(page, tenant.owner, tenant.name)
      const [definitions, clients] = await apiGet<[Definition[], { items: { id: string }[] }]>(
        page,
        tenant.owner,
        ['/custom-fields?entity=location', '/clients?pageSize=1'],
      )
      const [client] = await apiGet<[Client]>(page, tenant.owner, [
        `/clients/${clients.items[0]?.id ?? ''}`,
      ])
      const values = client.locations[0]?.customFields ?? {}
      const sensitive = definitions.find(
        (d) => d.isSensitive && d.type === 'text' && typeof values[d.key] === 'string',
      )
      if (!sensitive) throw new Error('The sample location has no sensitive text value')
      const secret = values[sensitive.key] as string

      await preview.entity.selectOption({ label: 'Lokacija' })
      await expect(
        preview.edit.getByRole('button', { name: `Prikaži: ${sensitive.label}` }),
      ).toBeVisible()
      expect(await isInPage(page, secret)).toBe(false)

      // Never revealed: left out of the request, the server keeps it
      await preview.check.click()
      await expect(preview.payload).toBeVisible()
      await expect(preview.payload).not.toContainText(`"${sensitive.key}"`)
      expect(await isInPage(page, secret)).toBe(false)

      await preview.read.getByRole('button', { name: `Prikaži: ${sensitive.label}` }).click()
      await expect(readValue(preview.read, sensitive.label)).toContainText(secret)

      // Revealed and unchanged: sent
      await preview.edit.getByRole('button', { name: `Prikaži: ${sensitive.label}` }).click()
      const input = preview.edit.getByLabel(labelled(sensitive.label))
      await expect(input).toHaveValue(secret)
      await preview.check.click()
      await expect(preview.payload).toContainText(`"${sensitive.key}": "${secret}"`)

      // Revealed and cleared: null clears it on the server
      await input.fill('')
      await preview.check.click()
      await expect(preview.payload).toContainText(`"${sensitive.key}": null`)
      await expect(readValue(preview.read, sensitive.label)).toHaveText('—Nije upisano')
    })
  })
}
