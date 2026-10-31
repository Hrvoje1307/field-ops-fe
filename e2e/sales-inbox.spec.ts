import { expect, type Page, test } from '@playwright/test'

import {
  apiGet,
  apiPost,
  expectSignedInAs,
  labelled,
  resetMock,
  SHARED_DISPATCHER,
  signIn,
  TENANTS,
} from './support'

interface Thread {
  id: string
  subject: string
  needsReview: boolean
  hasAttachments: boolean
  mailbox: { id: string; emailAddress: string; kind: string }
  deal?: { id: string; title: string } | null
  classification?: {
    category: string
    source: string
    isSales: boolean
    confidence?: number | null
  } | null
}
interface Page_<T> {
  items: T[]
  totalCount: number
}
interface ThreadDetail extends Thread {
  messages: {
    id: string
    bodyText?: string | null
    attachments: { partId: string; fileName: string; savedAttachmentId?: string | null }[]
  }[]
  mailboxes: { id: string; emailAddress: string }[]
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })
})

const rows = (page: Page) => page.getByTestId('thread-row')
const card = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

async function openInbox(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
}
async function threads(page: Page, email: string, query: string) {
  const [result] = await apiGet<[Page_<Thread>]>(page, email, [
    `/sales/threads?pageSize=100&${query}`,
  ])
  return result
}
async function threadDetail(page: Page, email: string, id: string) {
  const [result] = await apiGet<[ThreadDetail]>(page, email, [`/sales/threads/${id}`])
  return result
}
const open = async (page: Page, id: string, cardName = 'sales') => {
  await page.goto(`/sales/inbox?card=${cardName}&thread=${id}`)
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('each card is a set of API parameters and shows what the API returns', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const expected = {
        Prodaja: 'isSales=true',
        'Za pregled': 'needsReview=true',
        'Čeka odgovor': 'awaitingReply=true',
        Nepovezano: 'unlinked=true',
        Sve: '',
        'Nije prodaja': 'isSales=false',
      }
      const counts: Record<string, number> = {}
      for (const [name, query] of Object.entries(expected)) {
        counts[name] = Math.min((await threads(page, tenant.owner, query)).totalCount, 30)
      }
      const requests: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/sales/threads?')) requests.push(request.url())
      })
      await page.goto('/sales/inbox')
      for (const [name, query] of Object.entries(expected)) {
        requests.length = 0
        await card(page, name).click()
        await expect(card(page, name)).toHaveAttribute('aria-selected', 'true')
        await expect(rows(page)).toHaveCount(counts[name] ?? 0)
        const sent = new URL(requests.at(-1) ?? 'http://x/').searchParams
        for (const pair of query ? [query] : []) {
          const [key, value] = pair.split('=')
          expect(sent.get(key ?? '')).toBe(value)
        }
        if (name === 'Sve') {
          for (const key of ['isSales', 'needsReview', 'awaitingReply', 'unlinked']) {
            expect(sent.has(key)).toBe(false)
          }
        }
      }
    })

    test('a conversation: messages as text, mailboxes as labels, a body that is not stored says so', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const all = await threads(page, tenant.owner, 'isSales=true')
      const withDeal = all.items.find((t) => t.deal) ?? all.items[0]
      if (!withDeal) throw new Error('Seed needs conversations')
      const detail = await threadDetail(page, tenant.owner, withDeal.id)
      await open(page, withDeal.id)
      const view = page.getByRole('article', { name: withDeal.subject })
      await expect(view).toBeVisible()
      await expect(view.getByTestId('thread-message')).toHaveCount(detail.messages.length)
      const withBody = detail.messages.find((m) => m.bodyText)
      if (withBody?.bodyText) {
        await expect(
          view.getByText(withBody.bodyText.split('\n')[0] ?? '', { exact: false }).first(),
        ).toBeVisible()
      }
      for (const mailbox of detail.mailboxes) {
        await expect(view.getByRole('list', { name: 'Sandučići' })).toContainText(
          mailbox.emailAddress,
        )
      }
      await expect(
        view.getByRole('link', { name: `Prilika: ${withDeal.deal?.title ?? ''}` }),
      ).toBeVisible()

      // A body that is not stored: the snippet and the reason
      const none = (await threads(page, tenant.owner, 'isSales=false')).items
      for (const t of none) {
        const d = await threadDetail(page, tenant.owner, t.id)
        if (d.messages.some((m) => m.bodyText == null)) {
          await open(page, t.id, 'other')
          await expect(page.getByText('Sadržaj nije spremljen.').first()).toBeVisible()
          return
        }
      }
    })

    test('a correction is one click, sends both fields and shows who made it, with no percentage', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const target = (await threads(page, tenant.owner, 'isSales=true')).items.find(
        (t) => t.classification?.source === 'ai' && t.needsReview,
      )
      if (!target) throw new Error('Seed needs a conversation to review')
      await open(page, target.id, 'review')
      const view = page.getByRole('article', { name: target.subject })
      const aiCard = view.getByRole('region', { name: 'Što je AI prepoznao' })
      await expect(aiCard.getByText(/Sigurnost: \d+ %/)).toBeVisible()
      await expect(view.getByText('Za pregled').first()).toBeVisible()

      let sent: Record<string, unknown> | undefined
      page.on('request', (request) => {
        if (request.method() === 'PUT' && request.url().endsWith('/classification')) {
          sent = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
        }
      })
      await aiCard.getByRole('button', { name: 'Podrška' }).click()
      await expect(page.getByText('Ispravak je spremljen.')).toBeVisible()
      expect(sent).toEqual({ category: 'support', isSales: false })
      await expect(aiCard.getByText('Ispravio korisnik')).toBeVisible()
      await expect(aiCard.getByText(/Sigurnost/)).toHaveCount(0)
      await expect(aiCard.getByText('Za pregled')).toHaveCount(0)
      const saved = await threads(page, tenant.owner, 'isSales=false')
      expect(saved.items.find((t) => t.id === target.id)?.classification).toMatchObject({
        category: 'support',
        source: 'user',
        isSales: false,
        confidence: null,
      })

      // The switch back: both fields again
      await aiCard.getByRole('button', { name: 'Prodaja', exact: true }).click()
      await expect.poll(() => sent).toEqual({ category: 'support', isSales: true })
    })

    test('link to a deal found by search, unlink with a question, and make a deal from the conversation', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const free = (await threads(page, tenant.owner, 'unlinked=true')).items
      const [first, second] = free
      if (!first || !second) throw new Error('Seed needs two unlinked conversations')
      const [deals] = await apiGet<[Page_<{ id: string; title: string }>]>(page, tenant.owner, [
        '/sales/deals?status=open&pageSize=50',
      ])
      const deal = deals.items[0]
      if (!deal) throw new Error('Seed needs a deal')

      await open(page, first.id, 'unlinked')
      const view = page.getByRole('article', { name: first.subject })
      await view.getByRole('button', { name: 'Poveži s prilikom' }).click()
      const dialog = page.getByRole('dialog', { name: 'Poveži s prilikom' })
      await dialog.getByLabel('Traži prilike').fill(deal.title.slice(0, 8))
      await dialog.getByRole('button', { name: `Poveži: ${deal.title}` }).click()
      await expect(page.getByText('Razgovor je povezan s prilikom.')).toBeVisible()
      await expect(view.getByRole('link', { name: `Prilika: ${deal.title}` })).toBeVisible()
      expect((await threadDetail(page, tenant.owner, first.id)).deal?.id).toBe(deal.id)

      await view.getByRole('button', { name: 'Odveži' }).click()
      const confirm = page.getByRole('dialog', { name: 'Odvezati razgovor od prilike?' })
      await confirm.getByRole('button', { name: 'Odveži razgovor' }).click()
      await expect(confirm).toBeHidden()
      await expect(view.getByRole('button', { name: 'Poveži s prilikom' })).toBeVisible()
      expect((await threadDetail(page, tenant.owner, first.id)).deal ?? null).toBeNull()

      // A deal from the conversation: prefilled, confirmed by the person
      await open(page, second.id, 'unlinked')
      const second_view = page.getByRole('article', { name: second.subject })
      await second_view.getByRole('button', { name: 'Napravi priliku' }).click()
      const sheet = page.getByRole('dialog', { name: 'Nova prilika iz razgovora' })
      await expect(sheet.getByLabel(labelled('Naziv'))).toHaveValue(second.subject.slice(0, 200))
      await sheet.getByLabel(labelled('Naziv')).fill('Prilika iz razgovora')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Prilika je napravljena i povezana s razgovorom.')).toBeVisible()
      await expect(sheet).toBeHidden()
      const made = await threadDetail(page, tenant.owner, second.id)
      expect(made.deal?.title).toBe('Prilika iz razgovora')
      await expect(
        second_view.getByRole('link', { name: 'Prilika: Prilika iz razgovora' }),
      ).toBeVisible()
    })

    test('excluding a sender: an explicit choice of scope and purge, a warning for a domain', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const target = (await threads(page, tenant.owner, 'isSales=true')).items.find(
        (t) => !t.deal && t.mailbox.kind === 'shared',
      )
      if (!target) throw new Error('Seed needs a conversation')
      await open(page, target.id)
      const bodies: Record<string, unknown>[] = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/exclude')) {
          bodies.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>)
        }
      })
      await page.getByRole('button', { name: 'Isključi pošiljatelja' }).click()
      const dialog = page.getByRole('dialog', { name: 'Isključiti pošiljatelja?' })
      await expect(dialog.getByRole('radio', { name: /Samo ova adresa/ })).toBeChecked()
      await expect(
        dialog.getByText(/Briše se spremljeno tijelo poruka i klasifikacija/),
      ).toBeVisible()
      await dialog.getByRole('radio', { name: /Cijela domena/ }).check()
      await expect(dialog.getByText(/Isključuju se svi pošiljatelji s domene/)).toBeVisible()
      await dialog.getByRole('radio', { name: /Samo ova adresa/ }).check()
      await dialog.getByRole('checkbox', { name: 'Obriši spremljeni sadržaj' }).uncheck()
      await expect(dialog.getByText(/Spremljeni sadržaj se ne briše/)).toBeVisible()
      await dialog.getByRole('button', { name: 'Isključi', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByText(/Pravilo je dodano: /)).toBeVisible()
      expect(bodies).toHaveLength(1)
      expect(bodies[0]).toMatchObject({ purge: false })
      expect(String(bodies[0]?.pattern)).toMatch(/^[^@]+@[^@]+$/)

      // Out of Prodaja; where it is now is what the API says
      const salesAfter = await threads(page, tenant.owner, 'isSales=true')
      expect(salesAfter.items.some((t) => t.id === target.id)).toBe(false)
      await page.goto('/sales/inbox')
      await expect(rows(page)).toHaveCount(Math.min(salesAfter.totalCount, 30))
      await card(page, 'Nije prodaja').click()
      const otherAfter = await threads(page, tenant.owner, 'isSales=false')
      await expect(rows(page)).toHaveCount(Math.min(otherAfter.totalCount, 30))
    })

    test('save an attachment to the deal: off without a deal (with the reason), on with one, then marked', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const withFile = (await threads(page, tenant.owner, 'isSales=true')).items.filter(
        (t) => t.hasAttachments,
      )
      const linked = withFile.find((t) => t.deal)
      if (!linked) throw new Error('Seed needs a linked conversation with an attachment')
      const detail = await threadDetail(page, tenant.owner, linked.id)
      const message = detail.messages.find((m) => m.attachments.some((a) => !a.savedAttachmentId))
      const attachment = message?.attachments.find((a) => !a.savedAttachmentId)
      if (!attachment) throw new Error('Seed needs an unsaved attachment')

      // Without a deal: off, and says why
      const unlink = await apiPost(page, tenant.owner, `/sales/threads/${linked.id}/link`, {
        dealId: null,
      })
      expect(unlink.status).toBe(200)
      await open(page, linked.id)
      const view = page.getByRole('article', { name: linked.subject })
      await expect(view.getByRole('button', { name: 'Spremi na priliku' }).first()).toBeDisabled()
      await expect(
        view.getByText('Razgovor prvo povežite s prilikom, pa spremite privitak.').first(),
      ).toBeVisible()

      // With a deal: it saves, is marked and the deal has the file
      const relink = await apiPost(page, tenant.owner, `/sales/threads/${linked.id}/link`, {
        dealId: linked.deal?.id,
      })
      expect(relink.status).toBe(200)
      await open(page, linked.id)
      await view.getByRole('button', { name: `Spremi na priliku: ${attachment.fileName}` }).click()
      await expect(page.getByText('Privitak je spremljen uz priliku.')).toBeVisible()
      await expect(view.getByText('Spremljeno').first()).toBeVisible()
      await expect(view.getByRole('link', { name: 'Datoteke prilike' }).first()).toBeVisible()
      const [files] = await apiGet<[{ fileName: string }[]]>(page, tenant.owner, [
        `/attachments?ownerType=deal&ownerId=${linked.deal?.id ?? ''}`,
      ])
      expect(files.map((f) => f.fileName)).toContain(attachment.fileName)
    })

    test('reprocess queues the AI; the conversation is read again until it is done', async ({
      page,
    }) => {
      await openInbox(page, tenant.owner, tenant.name)
      const target = (await threads(page, tenant.owner, 'isSales=true')).items[0]
      if (!target) throw new Error('Seed needs a conversation')
      await open(page, target.id)
      const view = page.getByRole('article', { name: target.subject })
      await view.getByRole('button', { name: 'Ponovno obradi' }).click()
      await expect(page.getByText('Razgovor je poslan na ponovnu obradu.')).toBeVisible()
      await expect(view.getByText('AI još obrađuje razgovor…')).toBeVisible()
      await expect(view.getByText('AI još obrađuje razgovor…')).toBeHidden()
      await expect(view.getByRole('button', { name: 'Ponovno obradi' })).toBeEnabled()
    })
  })
}

test('another user’s personal mailbox is not shown: not its name in the filter, not its conversations', async ({
  page,
}) => {
  const tenant = TENANTS[0]
  await openInbox(page, SHARED_DISPATCHER, tenant.name)
  const mine = await threads(page, SHARED_DISPATCHER, 'isSales=true')
  const owners = await threads(page, tenant.owner, 'isSales=true')
  const personal = owners.items.filter((t) => t.mailbox.kind === 'personal')
  expect(personal.length).toBeGreaterThan(0)
  expect(mine.items.some((t) => t.mailbox.kind === 'personal')).toBe(false)
  // (read before navigating: right after a page load the mock is not up yet)
  const visible = Math.min((await threads(page, SHARED_DISPATCHER, '')).totalCount, 30)
  await page.goto('/sales/inbox?card=all')
  await expect(rows(page)).toHaveCount(visible)
  for (const hidden of personal) {
    await expect(
      page.getByRole('button', { name: `Otvori razgovor: ${hidden.subject}` }),
    ).toHaveCount(0)
  }
  await expect(page.getByRole('option', { name: 'Ivana Babić' })).toHaveCount(0)
})
