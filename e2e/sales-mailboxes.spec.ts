import { expect, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, labelled, resetMock, signIn, TENANTS } from './support'

interface Mailbox {
  id: string
  provider: 'gmail' | 'microsoft' | 'imap'
  emailAddress: string
  displayName: string
  kind: 'shared' | 'personal'
  status: string
  lastSyncedAt?: string | null
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const list = (page: Page) => page.getByRole('list', { name: 'Popis sandučića' })
const rowOf = (page: Page, name: string) =>
  list(page).getByRole('listitem').filter({ hasText: name })

async function openMailboxes(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
  await page.goto('/settings/sales/mailboxes')
  await expect(list(page)).toBeVisible()
}

async function mailboxes(page: Page, email: string) {
  const [all] = await apiGet<[Mailbox[]]>(page, email, ['/sales/mailboxes'])
  return all
}

/** The provider's (mock) consent page: signs in as `account`, or refuses. */
async function consent(page: Page, action: 'allow' | 'deny' | 'fail', account = '') {
  await expect(page.getByRole('heading', { name: /odobrenje pristupa/ })).toBeVisible()
  if (action === 'allow') {
    await page.getByLabel('Račun s kojim se prijavljujete').fill(account)
    await page.getByRole('button', { name: 'Dopusti pristup' }).click()
  } else {
    await page
      .getByRole('button', { name: action === 'deny' ? 'Odbij' : 'Greška davatelja' })
      .click()
  }
}

async function startConnect(page: Page, provider: 'Gmail ili Google Workspace' | 'Microsoft 365') {
  await page.getByRole('button', { name: 'Spoji sandučić' }).first().click()
  await page.getByRole('menuitem', { name: provider }).click()
  await page.getByRole('button', { name: 'Nastavi na prijavu' }).click()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('connect with OAuth: the browser goes to the provider and returns; the message is said once and the address is cleared', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const address = `prodaja@${tenant.owner.split('@')[1] ?? ''}`
      await startConnect(page, 'Gmail ili Google Workspace')
      await consent(page, 'allow', address)

      await expect(page.getByText('Sandučić je spojen.').first()).toBeVisible()
      await expect(page).toHaveURL('/settings/sales/mailboxes')
      // The return left no history entry of its own: going back is the provider's page
      await page.goBack()
      await expect(page).toHaveURL(/\/mock-oauth\/gmail/)
      await page.goForward()
      await expect(page).toHaveURL('/settings/sales/mailboxes')
      await expect(page.getByText('Sandučić je spojen.')).toHaveCount(0)

      // It starts as connecting and the list reads it again until it is active
      const row = rowOf(page, address)
      await expect(row).toBeVisible()
      await expect(row.getByText('Spaja se')).toBeVisible()
      await expect(row.getByText('Aktivan')).toBeVisible()
    })

    test('each error of the return has its own text; an unknown one a general text; the address is cleared', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const messages: Record<string, string> = {
        access_denied: 'Pristup nije odobren, pa sandučić nije spojen.',
        wrong_account: 'Prijavili ste se drugim računom od onog koji se ponovno spaja.',
        already_connected: 'Ta adresa je već spojena.',
        provider_error: 'Davatelj je javio grešku. Pokušajte ponovno.',
        something_new: 'Spajanje nije uspjelo. Pokušajte ponovno.',
      }
      for (const [code, text] of Object.entries(messages)) {
        await page.goto(`/sales/settings/mailboxes?error=${code}`)
        await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible()
        await expect(page).toHaveURL('/settings/sales/mailboxes')
      }
    })

    test('the provider can refuse, fail, or the account can already be connected', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const [existing] = await mailboxes(page, tenant.owner)

      await startConnect(page, 'Microsoft 365')
      await consent(page, 'deny')
      await expect(page.getByText('Pristup nije odobren, pa sandučić nije spojen.')).toBeVisible()

      await startConnect(page, 'Microsoft 365')
      await consent(page, 'fail')
      await expect(page.getByText('Davatelj je javio grešku. Pokušajte ponovno.')).toBeVisible()

      await startConnect(page, 'Microsoft 365')
      await consent(page, 'allow', existing?.emailAddress ?? '')
      await expect(page.getByText('Ta adresa je već spojena.').first()).toBeVisible()
    })

    test('IMAP: the server’s message is shown, the form keeps its fields but not the password; then it connects', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      await page.getByRole('button', { name: 'Spoji sandučić' }).first().click()
      await page.getByRole('menuitem', { name: 'Ostalo (IMAP i SMTP)' }).click()
      const sheet = page.getByRole('dialog', { name: 'Spoji sandučić (IMAP i SMTP)' })
      await sheet.getByLabel(labelled('Adresa sandučića')).fill('ured@poduzece.test')
      await sheet.getByLabel(labelled('Korisničko ime')).fill('ured@poduzece.test')
      const imap = sheet.getByRole('group', { name: 'Dolazna pošta (IMAP)' })
      const smtp = sheet.getByRole('group', { name: 'Odlazna pošta (SMTP)' })
      await imap.getByLabel(labelled('Poslužitelj')).fill('imap.nema.invalid')
      await smtp.getByLabel(labelled('Poslužitelj')).fill('smtp.poduzece.test')
      const password = sheet.getByLabel(labelled('Lozinka'))
      await expect(password).toHaveAttribute('autocomplete', 'new-password')
      await password.fill('tajna')
      await sheet.getByRole('button', { name: 'Spoji', exact: true }).click()

      await expect(
        page.getByText(
          /Spajanje na dolaznu poštu \(IMAP\) nije uspjelo\. Poslužitelj kaže: Could not connect to imap\.nema\.invalid:993/,
        ),
      ).toBeVisible()
      await expect(sheet.getByLabel(labelled('Adresa sandučića'))).toHaveValue('ured@poduzece.test')
      await expect(imap.getByLabel(labelled('Poslužitelj'))).toHaveValue('imap.nema.invalid')
      await expect(password).toHaveValue('')

      // A refused password is the server's message too
      await imap.getByLabel(labelled('Poslužitelj')).fill('imap.poduzece.test')
      await password.fill('wrong')
      await sheet.getByRole('button', { name: 'Spoji', exact: true }).click()
      await expect(page.getByText(/Poslužitelj kaže: Authentication failed\./)).toBeVisible()
      await expect(password).toHaveValue('')

      await password.fill('dobra-lozinka')
      await sheet.getByRole('button', { name: 'Spoji', exact: true }).click()
      await expect(page.getByText('Sandučić je spojen.')).toBeVisible()
      await expect(sheet).toBeHidden()
      const row = rowOf(page, 'ured@poduzece.test')
      await expect(row).toBeVisible()
      await expect(row.getByText('IMAP')).toBeVisible()
      // Nothing returned to the page contains the password
      expect(JSON.stringify(await mailboxes(page, tenant.owner))).not.toContain('dobra-lozinka')
    })

    test('reconnect: a Gmail or Microsoft mailbox goes through the provider with its id; a wrong account is refused', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const target = (await mailboxes(page, tenant.owner)).find((m) => m.provider !== 'imap')
      if (!target) throw new Error('Seed needs a Gmail or Microsoft mailbox')
      await page.evaluate((address) => {
        ;(
          window as unknown as { __fieldopsExpireMailbox: (a: string) => void }
        ).__fieldopsExpireMailbox(address)
      }, target.emailAddress)
      await page.reload()
      const row = rowOf(page, target.displayName)
      await expect(row.getByText('Treba ponovno spajanje')).toBeVisible()
      await expect(row.getByText('Pristup je opozvan kod davatelja.')).toBeVisible()

      await row.getByRole('button', { name: `Ponovno spoji: ${target.displayName}` }).click()
      await consent(page, 'allow', 'netko.drugi@pošta.test')
      await expect(
        page.getByText('Prijavili ste se drugim računom od onog koji se ponovno spaja.'),
      ).toBeVisible()
      await expect(
        rowOf(page, target.displayName).getByText('Treba ponovno spajanje'),
      ).toBeVisible()

      await rowOf(page, target.displayName)
        .getByRole('button', { name: `Ponovno spoji: ${target.displayName}` })
        .click()
      await consent(page, 'allow', target.emailAddress)
      await expect(page.getByText('Sandučić je spojen.').first()).toBeVisible()
      await expect(rowOf(page, target.displayName).getByText('Aktivan')).toBeVisible()
      expect(
        (await mailboxes(page, tenant.owner)).filter((m) => m.emailAddress === target.emailAddress),
      ).toHaveLength(1)
    })

    test('sync now asks for a sync and the last sync moves on', async ({ page }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const target = (await mailboxes(page, tenant.owner)).find((m) => m.status === 'active')
      if (!target) throw new Error('Seed needs an active mailbox')
      await rowOf(page, target.displayName)
        .getByRole('button', { name: `Sinkroniziraj sada: ${target.displayName}` })
        .click()
      await expect(page.getByText('Sinkronizacija je zatražena.')).toBeVisible()
      await expect
        .poll(async () => {
          const found = (await mailboxes(page, tenant.owner)).find((m) => m.id === target.id)
          return Date.parse(found?.lastSyncedAt ?? '') > Date.parse(target.lastSyncedAt ?? '')
        })
        .toBe(true)
    })

    test('pause and resume a mailbox', async ({ page }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const target = (await mailboxes(page, tenant.owner)).find((m) => m.status === 'active')
      if (!target) throw new Error('Seed needs an active mailbox')
      await rowOf(page, target.displayName)
        .getByRole('button', { name: `Pauziraj: ${target.displayName}` })
        .click()
      await expect(rowOf(page, target.displayName).getByText('Pauziran')).toBeVisible()
      await rowOf(page, target.displayName)
        .getByRole('button', { name: `Nastavi: ${target.displayName}` })
        .click()
      await expect(rowOf(page, target.displayName).getByText('Aktivan')).toBeVisible()
    })

    test('disconnect: the dialog says what happens; deleting what was imported needs one more confirmation', async ({
      page,
    }) => {
      await openMailboxes(page, tenant.owner, tenant.name)
      const [first, second] = await mailboxes(page, tenant.owner)
      if (!first || !second) throw new Error('Seed needs two mailboxes')
      const deletes: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'DELETE' && request.url().includes('/sales/mailboxes/')) {
          deletes.push(request.url())
        }
      })

      // Without purge
      await rowOf(page, first.displayName)
        .getByRole('button', { name: `Odspoji: ${first.displayName}` })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Odspojiti sandučić?' })
      await expect(
        dialog.getByText(/Već uvezeni razgovori, poruke i nacrti se ne brišu/),
      ).toBeVisible()
      await dialog.getByRole('button', { name: 'Odspoji sandučić' }).click()
      await expect(dialog).toBeHidden()
      await expect(rowOf(page, first.displayName)).toHaveCount(0)
      expect(deletes).toHaveLength(1)
      expect(deletes[0]).not.toContain('purge')

      // With purge: the button stays off until it is confirmed again
      await rowOf(page, second.displayName)
        .getByRole('button', { name: `Odspoji: ${second.displayName}` })
        .click()
      await dialog.getByRole('checkbox', { name: 'Obriši i uvezeni sadržaj' }).check()
      const confirm = dialog.getByRole('button', { name: 'Odspoji i obriši sadržaj' })
      await expect(confirm).toBeDisabled()
      await dialog.getByRole('checkbox', { name: /Razumijem da se uvezeni razgovori/ }).check()
      await expect(confirm).toBeEnabled()
      await confirm.click()
      await expect(dialog).toBeHidden()
      await expect(rowOf(page, second.displayName)).toHaveCount(0)
      expect(deletes).toHaveLength(2)
      expect(deletes[1]).toContain('purge=true')
      // Nothing left: the screen explains what mailboxes are for and offers to connect one
      await expect(page.getByText('Još nema spojenog sandučića')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Spoji sandučić' })).toHaveCount(2)
    })
  })
}

test('an IMAP mailbox with an error is reconnected through the form, with nothing prefilled but what the API knows', async ({
  page,
}) => {
  const tenant = TENANTS[1]
  await openMailboxes(page, tenant.owner, tenant.name)
  const target = (await mailboxes(page, tenant.owner)).find((m) => m.provider === 'imap')
  if (!target) throw new Error('Seed needs an IMAP mailbox')
  const row = rowOf(page, target.displayName)
  await expect(row.getByText('Greška', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: `Ponovno spoji: ${target.displayName}` }).click()
  const sheet = page.getByRole('dialog', { name: 'Ponovno spoji sandučić' })
  await expect(sheet.getByLabel(labelled('Adresa sandučića'))).toHaveValue(target.emailAddress)
  await expect(sheet.getByLabel(labelled('Lozinka'))).toHaveValue('')
  await expect(sheet.getByText(/Poslužitelji nisu dio podataka sandučića/)).toBeVisible()
  await sheet
    .getByRole('group', { name: 'Dolazna pošta (IMAP)' })
    .getByLabel(labelled('Poslužitelj'))
    .fill('imap.bura.test')
  await sheet
    .getByRole('group', { name: 'Odlazna pošta (SMTP)' })
    .getByLabel(labelled('Poslužitelj'))
    .fill('smtp.bura.test')
  await sheet.getByLabel(labelled('Lozinka')).fill('nova')
  await sheet.getByRole('button', { name: 'Spoji', exact: true }).click()
  // The contract has no way to reconnect an IMAP mailbox (docs/backend-questions.md #60)
  await expect(page.getByText(/Za ponovno spajanje IMAP sandučića odspojite ga/)).toBeVisible()
})
