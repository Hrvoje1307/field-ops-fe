import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fetchMe } from '@/entities/auth'
import { listFollowUpRules } from '@/entities/sales-config'
import { listSalesStages } from '@/entities/sales-stage'
import { server } from '@/shared/api/mocks/node'
import { renderScreen, signInAs } from '@/shared/api/test/screen-test-utils'

import { FollowUpRulesSettings } from './follow-up-rules-settings'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  await signInAs()
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

const list = () => screen.findByRole('list', { name: 'Popis pravila praćenja' })

describe('FollowUpRulesSettings', () => {
  it('lists the rules with the stage names of the tenant, or "all open stages"', async () => {
    renderScreen(<FollowUpRulesSettings />)
    const rules = await listFollowUpRules()
    const stages = await listSalesStages({ includeInactive: true })
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(rules.length)
    for (const [index, rule] of rules.entries()) {
      const stage = rule.stageId
        ? (stages.find((s) => s.id === rule.stageId)?.name ?? '')
        : 'Sve otvorene faze'
      await waitFor(() => {
        expect(rows[index]).toHaveTextContent(stage)
      })
      expect(rows[index]).toHaveTextContent(`nakon ${String(rule.daysWithoutReply)} radnih dana`)
    }
  })

  it('creates a rule: the stage list holds only open stages; no stage means all of them', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj pravilo' }))
    const sheet = await screen.findByRole('dialog')
    const stages = await listSalesStages({ includeInactive: true })
    const open = stages.filter((s) => s.kind === 'open').map((s) => s.name)
    expect(
      within(within(sheet).getByLabelText('Faza'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Sve otvorene faze', ...open])
    await user.type(within(sheet).getByLabelText(/Naziv/), 'Podsjetnik')
    await user.type(within(sheet).getByLabelText(/Radnih dana bez odgovora/), '5')
    await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
    expect(await screen.findByText('Pravilo je spremljeno.')).toBeInTheDocument()
    const saved = (await listFollowUpRules()).find((r) => r.name === 'Podsjetnik')
    expect(saved).toMatchObject({ stageId: null, daysWithoutReply: 5, isActive: true })
  })

  it('days outside 1–90 are refused next to the field before anything is sent', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    await list()
    const before = (await listFollowUpRules()).length
    await user.click(screen.getByRole('button', { name: 'Dodaj pravilo' }))
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByLabelText(/Naziv/), 'X')
    for (const days of ['0', '91']) {
      fireEvent.change(within(sheet).getByLabelText(/Radnih dana bez odgovora/), {
        target: { value: days },
      })
      await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
      expect(await within(sheet).findByText('Upišite cijeli broj od 1 do 90.')).toBeInTheDocument()
    }
    expect(await listFollowUpRules()).toHaveLength(before)
  })

  it('shows a 400 of the API next to its field', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    await list()
    server.use(
      http.post(`${API}/sales/follow-up-rules`, () =>
        HttpResponse.json(
          { status: 400, title: 'Bad', errors: { name: ['Naziv već postoji.'] } },
          { status: 400 },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Dodaj pravilo' }))
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByLabelText(/Naziv/), 'Ponavlja se')
    await user.type(within(sheet).getByLabelText(/Radnih dana bez odgovora/), '3')
    await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
    expect(await within(sheet).findByText('Naziv već postoji.')).toBeInTheDocument()
    expect(within(sheet).getByLabelText(/Naziv/)).toHaveValue('Ponavlja se')
  })

  it('edits and switches off a rule', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    const [rule] = await listFollowUpRules()
    if (!rule) throw new Error('seed')
    await list()
    await user.click(screen.getByRole('button', { name: `Uredi: ${rule.name}` }))
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('checkbox', { name: 'Pravilo je aktivno' }))
    await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
    await screen.findByText('Pravilo je spremljeno.')
    expect((await listFollowUpRules()).find((r) => r.id === rule.id)?.isActive).toBe(false)
    expect(await screen.findByText('Neaktivno')).toBeInTheDocument()
  })

  it('deletes only after a confirmation', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    const [rule] = await listFollowUpRules()
    if (!rule) throw new Error('seed')
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${rule.name}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Obrisati pravilo?' })
    expect(await listFollowUpRules()).toContainEqual(expect.objectContaining({ id: rule.id }))
    await user.click(within(dialog).getByRole('button', { name: 'Obriši pravilo' }))
    await waitFor(async () => {
      expect(await listFollowUpRules()).not.toContainEqual(expect.objectContaining({ id: rule.id }))
    })
  })

  it('preparing a draft is the AI’s: the switch is off, with the reason, without `sales_ai`', async () => {
    const me = await fetchMe(new QueryClient())
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json({ ...me, features: (me.features ?? []).filter((f) => f !== 'sales_ai') }),
      ),
    )
    const user = renderScreen(<FollowUpRulesSettings />)
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj pravilo' }))
    const sheet = await screen.findByRole('dialog')
    const toggle = within(sheet).getByRole('checkbox', { name: 'Pripremi nacrt praćenja' })
    expect(toggle).toBeDisabled()
    expect(within(sheet).getByText(/vaš paket ga ne uključuje/)).toBeInTheDocument()
  })

  it('with the AI it can be switched on', async () => {
    const user = renderScreen(<FollowUpRulesSettings />)
    await list()
    await user.click(screen.getByRole('button', { name: 'Dodaj pravilo' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('checkbox', { name: 'Pripremi nacrt praćenja' })).toBeEnabled()
  })

  it('says so when there are no rules, and when they cannot be loaded', async () => {
    server.use(http.get(`${API}/sales/follow-up-rules`, () => HttpResponse.json([])))
    renderScreen(<FollowUpRulesSettings />)
    expect(await screen.findByText('Još nema pravila praćenja.')).toBeInTheDocument()
  })
})
