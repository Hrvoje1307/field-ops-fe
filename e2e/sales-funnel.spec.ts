import { expect, type Locator, type Page, test } from '@playwright/test'

import {
  apiGet,
  apiPost,
  type Definition,
  expectSignedInAs,
  fillRequired,
  labelled,
  resetMock,
  signIn,
  TENANTS,
} from './support'

interface Deal {
  id: string
  title: string
  jobId?: string | null
  version: number
  lostReason?: string | null
  stage: { id: string; name: string; kind: 'open' | 'won' | 'lost' }
  client?: { id: string; name: string } | null
}
interface Board {
  columns: { stage: Deal['stage']; deals: Deal[]; totalCount: number }[]
}
interface JobType {
  id: string
  name: string
  isActive: boolean
}

test.beforeEach(async ({ page }) => {
  await resetMock(page)
  // A laptop: six stages do not fit, so the board scrolls inside its own container
  await page.setViewportSize({ width: 1440, height: 900 })
})

const handleOf = (page: Page, title: string) =>
  page.getByRole('button', { name: `Premjesti priliku ${title}` })
const columnOf = (page: Page, stageId: string) => page.getByTestId(`stage-${stageId}`)

async function getBoard(page: Page, email: string): Promise<Board> {
  const [board] = await apiGet<[Board]>(page, email, ['/sales/board?perStage=200'])
  return board
}
async function getDeal(page: Page, email: string, id: string): Promise<Deal> {
  const [deal] = await apiGet<[Deal]>(page, email, [`/sales/deals/${id}`])
  return deal
}

async function openBoard(page: Page, email: string, tenantName: string) {
  await signIn(page, email)
  await expectSignedInAs(page, tenantName)
  await page.goto('/sales/board')
  await expect(page.getByRole('region', { name: 'Lijevak prodaje' })).toBeVisible()
}

/** A deal in an open stage that still has no job, and the stage of each kind from the board. */
function pick(board: Board, where: (deal: Deal) => boolean = () => true) {
  const open = board.columns.filter((column) => column.stage.kind === 'open')
  const deal = open.flatMap((column) => column.deals).find((d) => !d.jobId && where(d))
  const won = board.columns.find((column) => column.stage.kind === 'won')
  const lost = board.columns.find((column) => column.stage.kind === 'lost')
  if (!deal || !won || !lost) throw new Error('Seed needs an open deal and a won and a lost stage')
  return { deal, won: won.stage, lost: lost.stage, open }
}

/**
 * Moves a card to a stage the way a person does: picks it up and, when the stage is
 * scrolled out of view, holds the card at the edge of the board until it scrolls there.
 */
async function moveCard(page: Page, title: string, stageId: string) {
  // The card itself may be scrolled out of view
  await handleOf(page, title).scrollIntoViewIfNeeded()
  const handle = await handleOf(page, title).boundingBox()
  const region = await page.getByRole('region', { name: 'Lijevak prodaje' }).boundingBox()
  if (!handle || !region) throw new Error('Nothing to drag')
  const frame = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 24, handle.y + 24, { steps: 4 })
  const target = columnOf(page, stageId).getByRole('list')
  for (let tries = 0; tries < 200; tries++) {
    const box = await target.boundingBox()
    const centre = box ? box.x + box.width / 2 : null
    if (centre !== null && centre > region.x + 40 && centre < region.x + region.width - 40) break
    const right = centre === null || centre >= region.x + region.width / 2
    await page.mouse.move(right ? region.x + region.width - 6 : region.x + 6, region.y + 120, {
      steps: 3,
    })
    await frame()
  }
  // Away from the edge the scrolling stops; only then is the stage where it is measured
  await page.mouse.move(region.x + region.width / 2, region.y + 120, { steps: 4 })
  await frame()
  await frame()
  const box = await target.boundingBox()
  if (!box) throw new Error('Stage not found')
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 30), { steps: 8 })
  // Let the board settle under the pointer (the scrolling has stopped) before letting go
  await frame()
  await frame()
  await page.mouse.up()
}

/** Waits until the dialog is really gone (a Radix dialog hides the page while it is open). */
async function closed(dialog: Locator) {
  await expect(dialog).toBeHidden()
}

for (const tenant of TENANTS) {
  test.describe(tenant.name, () => {
    test('columns follow the API order; a card moves to another stage and stays there', async ({
      page,
    }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const board = await getBoard(page, tenant.owner)
      const names = board.columns.map((column) => column.stage.name)
      const shown = await page
        .getByRole('region', { name: 'Lijevak prodaje' })
        .getByRole('heading', { level: 2 })
        .allTextContents()
      expect(shown).toEqual(names)

      const open = board.columns.filter((column) => column.stage.kind === 'open')
      const from = open.find((column) => column.deals.length > 0)
      const to = open.find((column) => column !== from)
      const deal = from?.deals[0]
      if (!from || !to || !deal) throw new Error('Seed needs two open stages')

      await moveCard(page, deal.title, to.stage.id)
      await expect(columnOf(page, to.stage.id).getByText(deal.title)).toBeVisible()
      await expect(columnOf(page, from.stage.id).getByText(deal.title)).toHaveCount(0)
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, deal.id)).stage.id)
        .toBe(to.stage.id)
    })

    test('a new deal entered by hand lands in the first open stage', async ({ page }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const board = await getBoard(page, tenant.owner)
      const first = board.columns.find((column) => column.stage.kind === 'open')
      if (!first) throw new Error('Seed needs an open stage')
      await page.getByRole('button', { name: 'Nova prilika' }).click()
      const sheet = page.getByRole('dialog', { name: 'Nova prilika' })
      await sheet.getByLabel(labelled('Naziv')).fill('Ručno upisana prilika')
      await sheet.getByLabel('Vrijednost').fill('1250,50')
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(page.getByText('Prilika je spremljena.')).toBeVisible()
      await closed(sheet)
      await expect(columnOf(page, first.stage.id).getByText('Ručno upisana prilika')).toBeVisible()
      const after = await getBoard(page, tenant.owner)
      const saved = after.columns
        .flatMap((c) => c.deals)
        .find((d) => d.title === 'Ručno upisana prilika')
      expect(saved).toMatchObject({ value: '1250.50' })
    })

    test('the board scrolls inside its container, never the page; a card can be moved to a stage out of view', async ({
      page,
    }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const board = await getBoard(page, tenant.owner)
      const { deal, lost } = pick(board)
      const last = board.columns.at(-1)?.stage
      expect(last?.id).toBe(lost.id)

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        board:
          (document.querySelector('[aria-label="Lijevak prodaje"][role="region"]')?.scrollWidth ??
            0) -
          (document.querySelector('[aria-label="Lijevak prodaje"][role="region"]')?.clientWidth ??
            0),
      }))
      expect(overflow.page).toBeLessThanOrEqual(0)
      expect(overflow.board).toBeGreaterThan(0)
      // Stages keep their width, so the last one starts off screen; the edge says there is more
      await expect(page.getByTestId('board-more-right')).toBeVisible()
      await expect(page.getByTestId('board-more-left')).toHaveCount(0)
      await expect(columnOf(page, lost.id)).not.toBeInViewport()
      // The header of a column (name, count, total) is there whatever the width
      await expect(columnOf(page, deal.stage.id).getByRole('heading', { level: 2 })).toBeVisible()

      await moveCard(page, deal.title, lost.id)
      const dialog = page.getByRole('dialog', { name: 'Zašto je prilika izgubljena?' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Razlog').selectOption({ label: 'Termin' })
      await dialog.getByRole('button', { name: 'Označi kao izgubljenu' }).click()
      await closed(dialog)
      await expect(columnOf(page, lost.id).getByText(deal.title)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollLeft)).toBe(0)
    })

    test('a lost stage asks for the reason first; cancelling sends nothing', async ({ page }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const { deal, lost } = pick(await getBoard(page, tenant.owner))

      const moves: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/move'))
          moves.push(request.url())
      })
      await moveCard(page, deal.title, lost.id)
      const dialog = page.getByRole('dialog', { name: 'Zašto je prilika izgubljena?' })
      await expect(dialog).toBeVisible()
      expect(moves).toEqual([])
      await dialog.getByRole('button', { name: 'Odustani' }).click()
      await closed(dialog)
      expect(moves).toEqual([])
      await expect(columnOf(page, deal.stage.id).getByText(deal.title)).toBeVisible()
      expect((await getDeal(page, tenant.owner, deal.id)).stage.id).toBe(deal.stage.id)

      await moveCard(page, deal.title, lost.id)
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Označi kao izgubljenu' }).click()
      await expect(dialog.getByText('Odaberite razlog.')).toBeVisible()
      await dialog.getByLabel('Razlog').selectOption({ label: 'Cijena' })
      await dialog.getByRole('button', { name: 'Označi kao izgubljenu' }).click()
      await closed(dialog)
      await expect(columnOf(page, lost.id).getByText(deal.title)).toBeVisible()
      const saved = await getDeal(page, tenant.owner, deal.id)
      expect(saved).toMatchObject({ lostReason: 'price', stage: { id: lost.id } })
    })

    test('a won deal is offered a conversion; the job shows in the jobs list and the deal links to it', async ({
      page,
    }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const { deal, won, open } = pick(await getBoard(page, tenant.owner), (d) => !!d.client)
      const [jobTypes, jobFields] = await apiGet<[JobType[], Definition[]]>(page, tenant.owner, [
        '/job-types',
        '/custom-fields?entity=job',
      ])
      const jobType = jobTypes.find((type) => type.isActive)
      if (!jobType) throw new Error('Seed needs a job type')

      await moveCard(page, deal.title, won.id)
      const offer = page.getByRole('dialog', { name: 'Prilika je dobivena' })
      await expect(offer).toBeVisible()
      await expect(columnOf(page, won.id).getByText(deal.title)).toBeVisible()
      await offer.getByRole('button', { name: 'Pretvori u nalog' }).click()

      const sheet = page.getByRole('dialog', { name: 'Pretvori u nalog' })
      await expect(sheet).toBeVisible()
      // The deal's client is already chosen; nothing else is chosen for the user
      await expect(sheet.getByText(deal.client?.name ?? '').first()).toBeVisible()
      // The client's locations load after the form opens
      await sheet.getByRole('region', { name: 'Lokacija' }).getByRole('radio').first().check()
      await sheet.getByLabel(labelled('Vrsta naloga')).selectOption({ label: jobType.name })
      await expect(sheet.getByLabel(labelled('Naslov'))).toHaveValue(deal.title)
      await fillRequired(sheet, jobFields)
      await sheet.getByRole('button', { name: 'Pretvori u nalog' }).click()

      await expect(page.getByText('Prilika je pretvorena u nalog.')).toBeVisible()
      await closed(sheet)
      const converted = await getDeal(page, tenant.owner, deal.id)
      expect(converted.jobId).toBeTruthy()
      const [jobs] = await apiGet<[{ items: { id: string; title: string }[] }]>(
        page,
        tenant.owner,
        ['/jobs?pageSize=200'],
      )
      expect(jobs.items.some((job) => job.id === converted.jobId && job.title === deal.title)).toBe(
        true,
      )

      // The job is in the office's list of jobs
      const [job] = await apiGet<[{ number: string }]>(page, tenant.owner, [
        `/jobs/${converted.jobId ?? ''}`,
      ])
      await page.getByRole('button', { name: 'Otvori nalog' }).click()
      await expect(page).toHaveURL(`/jobs/${converted.jobId ?? ''}`)
      await page.goto('/jobs')
      await expect(page.getByText(job.number).first()).toBeVisible()

      // Moving the converted deal out of the won stage and back does not offer it again
      await page.goto('/sales/board')
      const other = open.find((column) => column.stage.id !== deal.stage.id)
      if (!other) throw new Error('Seed needs two open stages')
      await expect(columnOf(page, won.id).getByText(deal.title)).toBeVisible()
      await moveCard(page, deal.title, other.stage.id)
      await expect(columnOf(page, other.stage.id).getByText(deal.title)).toBeVisible()
      // The first move is saved and the board has been read again before the next drag
      await expect(page.getByText(`Prilika je u fazi ${other.stage.name}.`)).toBeVisible()
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, deal.id)).stage.id)
        .toBe(other.stage.id)
      await page.waitForLoadState('networkidle')
      // Dropped on the list of cards: the column shrank when the deal left it
      await moveCard(page, deal.title, won.id)
      await expect(columnOf(page, won.id).getByText(deal.title)).toBeVisible()
      await expect
        .poll(async () => (await getDeal(page, tenant.owner, deal.id)).stage.id)
        .toBe(won.id)
      await expect(page.getByRole('dialog', { name: 'Prilika je dobivena' })).toHaveCount(0)
      await page.goto(`/sales/deals/${deal.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(deal.title)
      await expect(page.getByRole('link', { name: 'Otvori nalog' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Pretvori u nalog' })).toHaveCount(0)
    })

    test('"Kasnije" leaves a won deal unconverted; its page still offers the conversion', async ({
      page,
    }) => {
      await openBoard(page, tenant.owner, tenant.name)
      const { deal, won } = pick(await getBoard(page, tenant.owner))
      await moveCard(page, deal.title, won.id)
      const offer = page.getByRole('dialog', { name: 'Prilika je dobivena' })
      await offer.getByRole('button', { name: 'Kasnije' }).click()
      await closed(offer)
      await expect(columnOf(page, won.id).getByText(deal.title)).toBeVisible()
      expect((await getDeal(page, tenant.owner, deal.id)).jobId ?? null).toBeNull()
      await page.getByRole('link', { name: deal.title }).click()
      await expect(page.getByRole('button', { name: 'Pretvori u nalog' })).toBeVisible()
    })

    test('a file saved to a deal is listed, and a conversion copies it to the job', async ({
      page,
    }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const { deal } = pick(await getBoard(page, tenant.owner), (d) => !!d.client)
      await page.goto(`/sales/deals/${deal.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(deal.title)
      await page.getByLabel('Odaberi datoteku (PDF, JPEG ili PNG)').setInputFiles({
        name: 'ponuda.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 test'),
      })
      const files = page.getByRole('list', { name: 'Datoteke' })
      await expect(files.getByText('ponuda.pdf')).toBeVisible()

      const [client, jobTypes] = await apiGet<[{ locations: { id: string }[] }, JobType[]]>(
        page,
        tenant.owner,
        [`/clients/${deal.client?.id ?? ''}`, '/job-types'],
      )
      const jobFields = (
        await apiGet<[Definition[]]>(page, tenant.owner, ['/custom-fields?entity=job'])
      )[0]
      expect(jobFields.filter((field) => field.required)).toEqual([])
      const converted = await apiPost(page, tenant.owner, `/sales/deals/${deal.id}/convert`, {
        clientId: deal.client?.id,
        locationId: client.locations[0]?.id,
        job: { jobTypeId: jobTypes.find((type) => type.isActive)?.id, title: deal.title },
      })
      expect(converted.status).toBe(201)
      const jobId = (converted.body as { jobId: string }).jobId
      const [copied] = await apiGet<[{ fileName: string }[]]>(page, tenant.owner, [
        `/attachments?ownerType=job&ownerId=${jobId}`,
      ])
      expect(copied.map((file) => file.fileName)).toContain('ponuda.pdf')
    })

    test('a stale edit is a 409: the user is told and sees the newest data', async ({ page }) => {
      await signIn(page, tenant.owner)
      await expectSignedInAs(page, tenant.name)
      const { deal, open } = pick(await getBoard(page, tenant.owner))
      await page.goto(`/sales/deals/${deal.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(deal.title)

      // Someone else moves the deal behind the page's back
      const other = open.find((column) => column.stage.id !== deal.stage.id)
      if (!other) throw new Error('Seed needs two open stages')
      const moved = await apiPost(page, tenant.owner, `/sales/deals/${deal.id}/move`, {
        stageId: other.stage.id,
      })
      expect(moved.status).toBe(200)

      await page.getByRole('button', { name: 'Uredi' }).click()
      const sheet = page.getByRole('dialog', { name: 'Uredi priliku' })
      await sheet.getByLabel(labelled('Naziv')).fill(`${deal.title} (uređeno)`)
      await sheet.getByRole('button', { name: 'Spremi' }).click()
      await expect(
        page.getByText('Prilika je u međuvremenu promijenjena. Prikazani su najnoviji podaci.'),
      ).toBeVisible()
      expect((await getDeal(page, tenant.owner, deal.id)).title).toBe(deal.title)
    })
  })
}

for (const tenant of TENANTS) {
  test(`${tenant.name}: the owner adds a stage in the settings and it becomes a column, in the API's place`, async ({
    page,
  }) => {
    await signIn(page, tenant.owner)
    await expectSignedInAs(page, tenant.name)
    await page.goto('/settings/sales/stages')
    const list = page.getByRole('list', { name: 'Popis faza' })
    await expect(list).toBeVisible()
    await page.getByRole('button', { name: 'Dodaj fazu' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nova faza' })
    await dialog.getByLabel(labelled('Naziv')).fill('Dogovoren obilazak')
    await dialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Faza je spremljena.')).toBeVisible()
    await expect(list.getByText('Dogovoren obilazak')).toBeVisible()

    const board = await getBoard(page, tenant.owner)
    const names = board.columns.map((column) => column.stage.name)
    expect(names).toContain('Dogovoren obilazak')
    // New stages go before the won and lost ones
    expect(board.columns.at(-1)?.stage.kind).toBe('lost')
    await page.goto('/sales/board')
    const headings = page
      .getByRole('region', { name: 'Lijevak prodaje' })
      .getByRole('heading', { level: 2 })
    await expect(headings).toHaveCount(names.length)
    expect(await headings.allTextContents()).toEqual(names)
  })
}
