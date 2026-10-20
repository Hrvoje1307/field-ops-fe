import { expect, test } from '@playwright/test'

import {
  API_URL,
  expectSignedInAs,
  openUserMenu,
  resetMock,
  SHARED_DISPATCHER,
  signIn,
  TENANTS,
} from './support'

test.beforeEach(async ({ page }) => {
  await resetMock(page)
})

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('office user signs in and stays signed in after a reload', async ({ page }) => {
      await signIn(page, tenant.dispatcher)
      await expect(page).toHaveURL('/')
      await expectSignedInAs(page, tenant.name)

      await page.reload()
      await expect(page).toHaveURL('/')
      await expectSignedInAs(page, tenant.name)
      await expect(page.getByRole('heading', { level: 1, name: 'Danas' })).toBeVisible()
    })

    test('technician lands on the field view and cannot open office routes', async ({ page }) => {
      await signIn(page, tenant.technician)
      await expect(page).toHaveURL('/field')
      await expectSignedInAs(page, tenant.name)

      for (const path of ['/', '/jobs', '/clients']) {
        await page.goto(path)
        await expect(page, `technician opening ${path}`).toHaveURL('/field')
      }
    })

    test('office user cannot open the field view', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expect(page).toHaveURL('/')
      await page.goto('/field')
      await expect(page).toHaveURL('/')
    })
  })
}

test('comes back to the requested page after signing in', async ({ page }) => {
  await page.goto('/clients')
  await expect(page).toHaveURL('/login?redirect=%2Fclients')
  await signIn(page, TENANTS[0].dispatcher)
  await expect(page).toHaveURL('/clients')
  await expect(page.getByRole('heading', { level: 1, name: 'Klijenti' })).toBeVisible()
})

test('a wrong password shows "Pogrešan email ili lozinka."', async ({ page }) => {
  await signIn(page, TENANTS[0].dispatcher, 'wrong')
  await expect(page.getByRole('alert')).toHaveText('Pogrešan email ili lozinka.')
  await expect(page).toHaveURL('/login')
})

test('demo login buttons sign in with one click (mock mode)', async ({ page }) => {
  await page.getByRole('button', { name: 'Petra Jurić · Monter' }).click()
  await expect(page).toHaveURL('/field')
})

test('own sign-out goes to plain /login', async ({ page }) => {
  await signIn(page, TENANTS[0].dispatcher)
  await expectSignedInAs(page, TENANTS[0].name)
  await page.goto('/jobs')
  await expectSignedInAs(page, TENANTS[0].name)
  await openUserMenu(page)
  await page.getByRole('menuitem', { name: 'Odjavi se' }).click()
  await expect(page).toHaveURL('/login')

  // The session is really gone
  await page.goto('/jobs')
  await expect(page).toHaveURL('/login?redirect=%2Fjobs')
})

test('signing out in one tab signs out the other tabs', async ({ page, context }) => {
  await signIn(page, TENANTS[0].dispatcher)
  await expectSignedInAs(page, TENANTS[0].name)

  const other = await context.newPage()
  await other.goto('/jobs')
  await expectSignedInAs(other, TENANTS[0].name)

  await openUserMenu(page)
  await page.getByRole('menuitem', { name: 'Odjavi se' }).click()
  await expect(page).toHaveURL('/login')

  await expect(other).toHaveURL('/login?redirect=%2Fjobs&reason=signed_out_elsewhere')
  await expect(other.getByText('Odjavljeni ste u drugom prozoru.')).toBeVisible()
})

test('switching tenant reloads the data and shows the other company', async ({ page }) => {
  await signIn(page, SHARED_DISPATCHER)
  await expectSignedInAs(page, TENANTS[0].name)
  const main = page.getByRole('main')
  await expect(main.getByText(TENANTS[0].name, { exact: false })).toBeVisible()

  const meRequest = page.waitForRequest((request) => request.url() === `${API_URL}/me`)
  await openUserMenu(page)
  await page.getByRole('menuitemradio', { name: TENANTS[1].name }).click()
  await meRequest

  await expectSignedInAs(page, TENANTS[1].name)
  // Page content comes from the reloaded /me, not from the old tenant's cache
  await expect(main.getByText(TENANTS[1].name, { exact: false })).toBeVisible()
  await expect(main.getByText(TENANTS[0].name, { exact: false })).toHaveCount(0)

  await page.reload()
  await expectSignedInAs(page, TENANTS[1].name)
})

test('a tenant switch in one tab moves the other tab too', async ({ page, context }) => {
  await signIn(page, SHARED_DISPATCHER)
  await expectSignedInAs(page, TENANTS[0].name)
  const other = await context.newPage()
  await other.goto('/jobs')
  await expectSignedInAs(other, TENANTS[0].name)

  await openUserMenu(page)
  await page.getByRole('menuitemradio', { name: TENANTS[1].name }).click()
  await expectSignedInAs(page, TENANTS[1].name)

  await expectSignedInAs(other, TENANTS[1].name)
})

test('revoked access ends on /login with a clear message', async ({ page }) => {
  await signIn(page, 'luka@alarmko.test')
  await expect(page).toHaveURL('/field')

  // The owner deactivates Luka (through the mock API in this browser)
  await page.evaluate(async (api) => {
    const json = { 'Content-Type': 'application/json' }
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: 'vlasnik@alarmko.test', password: 'demo' }),
    })
    const { accessToken } = (await login.json()) as { accessToken: string }
    const auth = { ...json, Authorization: `Bearer ${accessToken}` }
    const members = (await (await fetch(`${api}/users`, { headers: auth })).json()) as {
      userId: string
      email: string
    }[]
    const luka = members.find((m) => m.email === 'luka@alarmko.test')
    await fetch(`${api}/users/${luka?.userId ?? ''}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ role: 'technician', isActive: false }),
    })
  }, API_URL)

  await page.reload()
  await expect(page).toHaveURL('/login?reason=access_revoked')
  await expect(page.getByText('Vaš pristup je ukinut. Obratite se vlasniku tvrtke.')).toBeVisible()
})

test('forgot password always shows the same confirmation', async ({ page }) => {
  await page.getByRole('link', { name: 'Zaboravili ste lozinku?' }).click()
  await expect(page).toHaveURL('/forgot-password')
  // The route is code-split: wait for the new page, not just the URL
  await expect(page.getByRole('heading', { level: 1, name: 'Nova lozinka' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('nepoznat@primjer.test')
  await page.getByRole('button', { name: 'Pošalji poveznicu' }).click()
  await expect(
    page.getByText(
      'Ako postoji račun s adresom nepoznat@primjer.test, poslali smo upute za novu lozinku.',
    ),
  ).toBeVisible()
})
