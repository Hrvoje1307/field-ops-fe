import { expect, type Locator, type Page, test } from '@playwright/test'

import { apiGet, expectSignedInAs, resetMock, signIn, TENANTS } from './support'

interface Deal {
  id: string
  title: string
  jobId?: string | null
  lostReason?: string | null
  stage: { id: string; name: string; kind: string }
}
interface Stage {
  id: string
  name: string
  kind: 'open' | 'won' | 'lost'
}
interface Board {
  columns: { stage: Stage; deals: Deal[] }[]
}

/** A phone: the module is one column, with targets a thumb can hit. */
test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 390, height: 844 })
})

const MIN_TARGET = 44

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function expectBigEnough(target: Locator) {
  const box = await target.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET - 1)
}

const getBoard = async (page: Page, email: string) =>
  (await apiGet<[Board]>(page, email, ['/sales/board?perStage=200']))[0]
const getDeal = async (page: Page, email: string, id: string) =>
  (await apiGet<[Deal]>(page, email, [`/sales/deals/${id}`]))[0]

async function start(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
}

function pick(board: Board) {
  const open = board.columns.filter((column) => column.stage.kind === 'open')
  const deal = open.flatMap((column) => column.deals).find((d) => !d.jobId)
  const other = open.find((column) => column.stage.id !== deal?.stage.id)
  const won = board.columns.find((column) => column.stage.kind === 'won')
  const lost = board.columns.find((column) => column.stage.kind === 'lost')
  if (!deal || !other || !won || !lost) throw new Error('Seed needs open, won and lost stages')
  return { deal, other: other.stage, won: won.stage, lost: lost.stage }
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('Today: one column, big targets, a row opens the conversation and Back returns', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const [data] = await apiGet<[{ items: { thread: { id: string; subject: string } }[] }]>(
        page,
        tenant.owner,
        ['/sales/today'],
      )
      const first = data.items[0]
      if (!first) throw new Error('Seed needs an item for today')
      await page.goto('/sales')
      await expect(page.getByTestId('today-item').first()).toBeVisible()
      await expectNoSideScroll(page)
      await expectBigEnough(page.getByLabel('Prikaz za'))
      const open = page
        .getByRole('link', { name: `Otvori razgovor: ${first.thread.subject}` })
        .first()
      await expectBigEnough(open)

      await open.click()
      await expect(page).toHaveURL(new RegExp(`thread=${first.thread.id}`))
      await expect(page.getByRole('article', { name: first.thread.subject })).toBeVisible()
      await expectNoSideScroll(page)
      await page.goBack()
      await expect(page).toHaveURL(/\/sales$/)
      await expect(page.getByTestId('today-item').first()).toBeVisible()
    })

    test('the funnel is a list of stages; "Premjesti u…" moves a card, a lost stage asks for the reason, a won one offers the conversion', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      const board = await getBoard(page, tenant.owner)
      const { deal, other, won, lost } = pick(board)
      await page.goto('/sales/board')
      const region = page.getByRole('region', { name: 'Lijevak prodaje' })
      await expect(region).toBeVisible()
      await expectNoSideScroll(page)
      // Nothing to drag, and every stage is there, in the API's order
      await expect(page.getByRole('button', { name: /^Premjesti priliku/ })).toHaveCount(0)
      await expect(region.getByRole('heading', { level: 2 })).toHaveText(
        board.columns.map((column) => column.stage.name),
      )
      const move = page.getByRole('combobox', { name: `Premjesti u…: ${deal.title}` })
      await expectBigEnough(move)

      await move.selectOption({ label: other.name })
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, deal.id)).stage.id)
        .toBe(other.id)
      await expect(page.getByTestId(`stage-${other.id}`).getByText(deal.title)).toBeVisible()

      // Lost: the reason first; cancelling sends nothing
      await page
        .getByRole('combobox', { name: `Premjesti u…: ${deal.title}` })
        .selectOption({ label: lost.name })
      const dialog = page.getByRole('dialog', { name: 'Zašto je prilika izgubljena?' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Odustani' }).click()
      await expect(dialog).toBeHidden()
      expect((await getDeal(page, tenant.owner, deal.id)).stage.id).toBe(other.id)
      await page
        .getByRole('combobox', { name: `Premjesti u…: ${deal.title}` })
        .selectOption({ label: lost.name })
      await dialog.getByLabel('Razlog').selectOption({ label: 'Cijena' })
      await dialog.getByRole('button', { name: 'Označi kao izgubljenu' }).click()
      await expect(dialog).toBeHidden()
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, deal.id)).lostReason)
        .toBe('price')

      // Won: the conversion is offered, "Kasnije" leaves it for the deal's page
      const next = pick(await getBoard(page, tenant.owner)).deal
      await page
        .getByRole('combobox', { name: `Premjesti u…: ${next.title}` })
        .selectOption({ label: won.name })
      const offer = page.getByRole('dialog', { name: 'Prilika je dobivena' })
      await expect(offer).toBeVisible()
      await offer.getByRole('button', { name: 'Kasnije' }).click()
      await expect(offer).toBeHidden()
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, next.id)).stage.id)
        .toBe(won.id)
    })

    test('a deal: one column, the one primary action in view, big targets', async ({ page }) => {
      await start(page, tenant.owner, tenant.name)
      const { deal } = pick(await getBoard(page, tenant.owner))
      await page.goto(`/sales/deals/${deal.id}`)
      await expect(page.getByRole('heading', { level: 1, name: deal.title })).toBeVisible()
      await expectNoSideScroll(page)
      const primary = page.getByRole('button', { name: 'Pretvori u nalog' })
      await expect(primary).toBeInViewport()
      await expectBigEnough(primary)
      await expectBigEnough(page.getByRole('button', { name: 'Uredi' }))
      await expectBigEnough(page.getByLabel('Faza'))
    })

    test('the inbox: a conversation replaces the list; Back and "Natrag na popis" both return to it', async ({
      page,
    }) => {
      await start(page, tenant.owner, tenant.name)
      await page.goto('/sales/inbox')
      const rows = page.getByTestId('thread-row')
      await expect(rows.first()).toBeVisible()
      await expectNoSideScroll(page)
      await rows.first().click()
      await expect(page).toHaveURL(/thread=/)
      await expect(page.getByRole('article').first()).toBeVisible()
      await expect(rows.first()).toBeHidden()
      await expectNoSideScroll(page)

      await page.goBack()
      await expect(page).not.toHaveURL(/thread=/)
      await expect(rows.first()).toBeVisible()

      await rows.first().click()
      await expect(page).toHaveURL(/thread=/)
      await expectBigEnough(page.getByRole('button', { name: 'Natrag na popis' }))
      await page.getByRole('button', { name: 'Natrag na popis' }).click()
      await expect(page).not.toHaveURL(/thread=/)
      await expect(rows.first()).toBeVisible()
    })
  })
}
