import { expect, type Page, test } from '@playwright/test'

import { apiGet, apiPost, expectSignedInAs, labelled, resetMock, signIn, TENANTS } from './support'

interface Deal {
  id: string
  title: string
  jobId?: string | null
  stage: { id: string; name: string; kind: string }
}
interface Board {
  columns: { stage: { id: string; name: string; kind: string }; deals: Deal[] }[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const dropHub = (page: Page, outageMs: number) =>
  page.evaluate((ms) => {
    ;(window as unknown as { __fieldopsDropHub: (ms?: number) => void }).__fieldopsDropHub(ms)
  }, outageMs)

async function dealAndOtherStage(page: Page, email: string) {
  const [board] = await apiGet<[Board]>(page, email, ['/sales/board?perStage=200'])
  const open = board.columns.filter((c) => c.stage.kind === 'open')
  const deal = open.flatMap((c) => c.deals).find((d) => !d.jobId)
  const other = open.find((c) => c.stage.id !== deal?.stage.id)
  if (!deal || !other) throw new Error('Seed needs a deal and two open stages')
  return { deal, other: other.stage }
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('a deal moved by someone else is moved on the open deal page and on the funnel, without a reload', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const { deal, other } = await dealAndOtherStage(page, tenant.owner)

      await page.goto(`/sales/deals/${deal.id}`)
      await expect(page.getByRole('heading', { level: 1, name: deal.title })).toBeVisible()
      await expect(page.getByLabel('Faza')).toHaveValue(deal.stage.id)
      const moved = await apiPost(page, tenant.dispatcher, `/sales/deals/${deal.id}/move`, {
        stageId: other.id,
      })
      expect(moved.status).toBe(200)
      await expect(page.getByLabel('Faza')).toHaveValue(other.id)

      // The funnel, opened from here, shows it in its new stage; the next move is heard there too
      await page.getByRole('link', { name: 'Natrag na lijevak' }).click()
      await expect(page.getByTestId(`stage-${other.id}`).getByText(deal.title)).toBeVisible()
      const back = await apiPost(page, tenant.dispatcher, `/sales/deals/${deal.id}/move`, {
        stageId: deal.stage.id,
      })
      expect(back.status).toBe(200)
      await expect(page.getByTestId(`stage-${deal.stage.id}`).getByText(deal.title)).toBeVisible()
      await expect(page.getByTestId(`stage-${other.id}`).getByText(deal.title)).toHaveCount(0)
    })

    test('without the live connection a draft that is being written is still read again, slowly', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const [list] = await apiGet<
        [{ items: { id: string; subject: string; mailbox: { kind: string } }[] }]
      >(page, tenant.owner, ['/sales/threads?isSales=true&pageSize=100'])
      let target: { id: string; subject: string } | undefined
      for (const item of list.items.filter((t) => t.mailbox.kind === 'shared')) {
        const [full] = await apiGet<[{ drafts: { status: string }[] }]>(page, tenant.owner, [
          `/sales/threads/${item.id}`,
        ])
        if (!full.drafts.some((d) => !['discarded', 'sent'].includes(d.status))) {
          target = item
          break
        }
      }
      if (!target) throw new Error('Seed needs a conversation without a draft')
      await page.goto(`/sales/inbox?card=all&thread=${target.id}`)
      const view = page.getByRole('article', { name: target.subject })
      await expect(view).toBeVisible()

      // The hub is gone for a minute: only the reserve can bring the result
      await dropHub(page, 60_000)
      await view.getByRole('button', { name: 'Pripremi nacrt' }).click()
      const ask = page.getByRole('dialog', { name: 'Pripremi nacrt odgovora' })
      await ask.getByRole('button', { name: 'Pripremi nacrt' }).click()
      await expect(ask).toBeHidden()
      const draft = view.getByRole('region', { name: 'Nacrt odgovora' })
      await expect(draft.getByLabel(labelled('Tekst'))).not.toHaveValue('')
    })
  })
}
