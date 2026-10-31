import { expect, type Page, test } from '@playwright/test'

import {
  apiGet,
  type Definition,
  expectSignedInAs,
  fillRequired,
  labelled,
  resetMock,
  signIn,
  TENANTS,
} from './support'

/** The fields of the contract this test reads (kept minimal on purpose). */
interface ClientSummary {
  id: string
}
interface Client {
  id: string
  name: string
  contacts: { phone?: string | null }[]
  locations: { id: string; address?: string }[]
}
interface JobType {
  name: string
  isActive: boolean
}
interface Lookup {
  matches: Client[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

async function openForm(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expect(page).toHaveURL('/')
  await expectSignedInAs(page, tenantName)
}

async function describeJob(page: Page, jobType: string, title: string, jobFields: Definition[]) {
  const section = page.getByRole('region', { name: 'Nalog' })
  await section.getByLabel(labelled('Vrsta naloga')).selectOption({ label: jobType })
  await section.getByLabel(labelled('Naslov')).fill(title)
  await fillRequired(section, jobFields)
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('existing client by phone: the job opens on its page and is in the list', async ({
      page,
    }) => {
      await openForm(page, tenant.dispatcher, tenant.name)
      const [clients, jobTypes, jobFields] = await apiGet<
        [{ items: ClientSummary[] }, JobType[], Definition[]]
      >(page, tenant.dispatcher, [
        '/clients?pageSize=20',
        '/job-types',
        '/custom-fields?entity=job',
      ])
      const details = await apiGet<Client[]>(
        page,
        tenant.dispatcher,
        clients.items.map((client) => `/clients/${client.id}`),
      )
      const client = details.find(
        (candidate) =>
          candidate.locations.length > 0 && candidate.contacts.some((contact) => contact.phone),
      )
      const phone = client?.contacts.find((contact) => contact.phone)?.phone
      const location = client?.locations[0]
      if (!client || !phone || !location?.address)
        throw new Error('Seed needs a client with a phone')
      const jobType = jobTypes.find((type) => type.isActive)
      if (!jobType) throw new Error('Seed needs an active job type')

      await page.getByRole('link', { name: 'Novi nalog' }).first().click()
      await expect(page).toHaveURL('/jobs/new')
      await page.getByLabel('Broj s kojeg klijent zove').fill(phone)
      await page.getByRole('button', { name: 'Traži', exact: true }).click()
      const match = page.getByRole('listitem').filter({ hasText: client.name })
      await match.getByRole('button', { name: 'Odaberi' }).click()
      const locationSection = page.getByRole('region', { name: 'Lokacija' })
      const locationChoice = locationSection.getByRole('radio', { name: location.address })
      if (client.locations.length > 1) await locationChoice.check()
      await expect(locationChoice).toBeChecked()

      // Only active job types are offered for new jobs
      const offered = await page
        .getByRole('region', { name: 'Nalog' })
        .getByLabel(labelled('Vrsta naloga'))
        .locator('option')
        .allTextContents()
      expect(offered.slice(1).sort()).toEqual(
        jobTypes
          .filter((type) => type.isActive)
          .map((type) => type.name)
          .sort(),
      )

      const title = `Quick ${tenant.name}`
      await describeJob(page, jobType.name, title, jobFields)
      await page.getByRole('button', { name: 'Spremi nalog' }).click()

      await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(page.locator('main header [data-status]')).toHaveText('Novi')
      await expect(page.getByRole('region', { name: 'Klijent' })).toContainText(client.name)
      await expect(page.getByRole('region', { name: 'Lokacija' })).toContainText(location.address)

      await page.goto(`/jobs?q=${encodeURIComponent(title)}`)
      await expect(page.getByTestId('job-row')).toHaveCount(1)
      await expect(page.getByTestId('job-row')).toContainText(title)
    })

    test("new client with a first location; the tenant's required fields are asked for", async ({
      page,
    }) => {
      await openForm(page, tenant.dispatcher, tenant.name)
      const [jobTypes, clientFields, locationFields, jobFields] = await apiGet<
        [JobType[], Definition[], Definition[], Definition[]]
      >(page, tenant.dispatcher, [
        '/job-types',
        '/custom-fields?entity=client',
        '/custom-fields?entity=location',
        '/custom-fields?entity=job',
      ])
      const jobType = jobTypes.find((type) => type.isActive)
      if (!jobType) throw new Error('Seed needs an active job type')
      const phone = `098 ${String(Date.now()).slice(-7)}`

      await page.goto('/jobs/new')
      await page.getByLabel('Broj s kojeg klijent zove').fill(phone)
      await page.getByRole('button', { name: 'Traži', exact: true }).click()
      await page.getByRole('button', { name: 'Novi klijent s ovim brojem' }).click()

      const clientSection = page.getByRole('region', { name: 'Klijent' })
      await clientSection.getByLabel(labelled('Ime i prezime')).fill('Marina E2E')
      const locationSection = page.getByRole('region', { name: 'Lokacija' })
      await locationSection.getByLabel(labelled('Ulica i kućni broj')).fill('Testna 1')
      await locationSection.getByLabel(labelled('Mjesto')).fill('Zagreb')
      await describeJob(page, jobType.name, 'Novi klijent E2E', jobFields)

      if (clientFields.some((definition) => definition.required)) {
        // Asked for by the tenant's configuration, not by code
        await page.getByRole('button', { name: 'Spremi nalog' }).click()
        await expect(clientSection.getByText('Obavezno polje.').first()).toBeVisible()
        await expect(page).toHaveURL('/jobs/new')
      }
      await fillRequired(clientSection, clientFields)
      await fillRequired(locationSection, locationFields)
      await page.getByRole('button', { name: 'Spremi nalog' }).click()

      await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/)
      await expect(page.getByRole('region', { name: 'Klijent' })).toContainText('Marina E2E')
      await expect(page.getByRole('region', { name: 'Lokacija' })).toContainText('Testna 1')

      // Created once, and found by the number next time
      const [lookup] = await apiGet<[Lookup]>(page, tenant.dispatcher, [
        `/clients/lookup?phone=${encodeURIComponent(phone)}`,
      ])
      expect(lookup.matches.map((match) => match.name)).toEqual(['Marina E2E'])
    })

    test('a number the API rejects shows its message next to the phone', async ({ page }) => {
      await openForm(page, tenant.dispatcher, tenant.name)
      await page.goto('/jobs/new')
      const phone = page.getByLabel('Broj s kojeg klijent zove')
      await phone.fill('abc')
      await phone.press('Enter')
      await expect(page.getByText('Neispravan broj telefona.')).toBeVisible()
      await expect(phone).toHaveAttribute('aria-invalid', 'true')
      // Enter searched; it didn't submit the form
      await expect(page.getByText('Odaberite vrstu naloga.')).toHaveCount(0)
    })
  })
}
