import { expect, type Locator, type Page } from '@playwright/test'

export const PASSWORD = 'demo'

/** The two mock tenants (see README, "Mock API"). */
export const TENANTS = [
  {
    name: 'Alarmko d.o.o.',
    owner: 'vlasnik@alarmko.test',
    dispatcher: 'dispecer@alarmko.test',
    technician: 'petra@alarmko.test',
  },
  {
    name: 'Bura klima d.o.o.',
    owner: 'vlasnik@bura.test',
    dispatcher: 'dispecer@bura.test',
    technician: 'ante@bura.test',
  },
] as const

/** A tenant whose plan has no Sales module; reached by switching tenant as the shared dispatcher. */
export const NO_SALES_TENANT = { name: 'Čisto d.o.o.', owner: 'vlasnik@cisto.test' } as const

/** Dispatcher in all three tenants (the Sales permission: yes in Alarmko, no in Bura). */
export const SHARED_DISPATCHER = 'ana@demo.test'

/** VITE_API_URL from .env.development (the mock intercepts it in the browser). */
export const API_URL = 'http://localhost:5080/api/v1'

/**
 * "Today" in every e2e test: a Wednesday, so "tomorrow" is a working day whatever day the
 * suite runs (the seed and the day screens skip weekends). The clock starts at that
 * moment and then runs normally (a frozen clock would stop everything that waits for a
 * time to pass: the mock hub's outage, token expiry). Same day as `fixToday()` in Vitest.
 */
export const FIXED_NOW = new Date('2026-10-28T09:00:00Z')

export async function fixClock(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_NOW })
  await page.clock.resume()
}

/**
 * Fresh mock state for every test: fixed clock, no session, no login lock, no switched
 * tenant. (Each test also gets its own browser context; this makes the reset explicit.)
 * Every spec starts with it, so every spec has the same "today".
 */
export async function resetMock(page: Page): Promise<void> {
  await fixClock(page)
  await page.goto('/login')
  await page.waitForFunction(() => '__fieldopsResetMock' in window)
  await page.evaluate(() => {
    localStorage.clear()
    ;(window as unknown as { __fieldopsResetMock: () => void }).__fieldopsResetMock()
  })
  await page.reload()
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Lozinka', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Prijavi se' }).click()
}

export async function openUserMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Korisnički izbornik' }).click()
}

export async function signOut(page: Page): Promise<void> {
  await openUserMenu(page)
  await page.getByRole('menuitem', { name: 'Odjavi se' }).click()
  await expect(page).toHaveURL('/login')
}

export async function expectSignedInAs(page: Page, tenantName: string): Promise<void> {
  await expect(page.getByTestId('tenant-name')).toHaveText(tenantName)
}

/**
 * GET requests to the mock API from the page (MSW runs there), signed in as `email`
 * with a session of their own. Lets tests read what the app should show.
 */
export async function apiGet<T extends unknown[]>(
  page: Page,
  email: string,
  paths: readonly string[],
): Promise<T> {
  return (await page.evaluate(
    async ({ api, email, password, paths }) => {
      const login = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const { accessToken } = (await login.json()) as { accessToken: string }
      return Promise.all(
        paths.map(async (path) => {
          const response = await fetch(`${api}${path}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          return (await response.json()) as unknown
        }),
      )
    },
    { api: API_URL, email, password: PASSWORD, paths },
  )) as T
}

/**
 * A POST to the mock API from the page, as `email` with a session of their own:
 * someone else changing data behind the UI's back.
 */
export async function apiPost(
  page: Page,
  email: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ api, email, password, path, body }) => {
      const login = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const { accessToken } = (await login.json()) as { accessToken: string }
      const response = await fetch(`${api}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      })
      return { status: response.status, body: (await response.json()) as unknown }
    },
    { api: API_URL, email, password: PASSWORD, path, body },
  )
}

/** The next working weekday on the tenant's calendar (both mock tenants are in Zagreb). */
export async function nextWorkday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const zagreb = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(date)
    const date = new Date(`${zagreb(new Date())}T12:00:00Z`)
    do date.setUTCDate(date.getUTCDate() + 1)
    while ([0, 6].includes(date.getUTCDay()))
    return date.toISOString().slice(0, 10)
  })
}

/**
 * Presses on a drag handle, moves in steps (dnd-kit needs real moves) and lets go over
 * `target`.
 */
export async function drag(
  page: Page,
  handle: Locator,
  target: Locator,
  at: 'top' | 'middle' = 'middle',
): Promise<void> {
  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('Nothing to drag')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 24, from.y + from.height / 2 + 24, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + (at === 'top' ? 4 : to.height / 2), {
    steps: 16,
  })
  await page.mouse.up()
}

/** A custom-field definition, as far as the tests read it. */
export interface Definition {
  key: string
  label: string
  type: string
  required: boolean
  options?: { value: string; label: string }[] | null
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A label as shown: required fields end with a visual `*`. */
export const labelled = (label: string) => new RegExp(`^${escape(label)}\\*?$`)

/** Fills the tenant's required custom fields of one record, whatever their types. */
export async function fillRequired(scope: Locator, definitions: Definition[]) {
  for (const definition of definitions.filter((d) => d.required)) {
    switch (definition.type) {
      case 'select':
        await scope.getByLabel(labelled(definition.label)).selectOption({ index: 1 })
        break
      case 'multiselect':
        await scope
          .getByRole('group', { name: definition.label })
          .getByRole('checkbox')
          .first()
          .check()
        break
      case 'checkbox':
        break // unticked is an answer (docs/backend-questions.md #24)
      case 'number':
        await scope.getByLabel(labelled(definition.label)).fill('1')
        break
      case 'date':
        await scope.getByLabel(labelled(definition.label)).fill('2026-12-01')
        break
      default:
        await scope.getByLabel(labelled(definition.label)).fill('E2E')
    }
  }
}
