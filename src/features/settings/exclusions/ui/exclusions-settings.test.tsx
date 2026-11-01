import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listExclusionRules } from '@/entities/sales-config'
import { server } from '@/shared/api/mocks/node'
import { renderScreen, signInAs } from '@/shared/api/test/screen-test-utils'

import { ExclusionsSettings } from './exclusions-settings'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  await signInAs()
})

afterEach(() => {
  server.events.removeAllListeners()
  toast.dismiss()
})

const list = () => screen.findByRole('list', { name: 'Popis isključenja' })

describe('ExclusionsSettings', () => {
  it('lists the rules, telling domains from addresses, with their notes', async () => {
    renderScreen(<ExclusionsSettings />)
    const rules = await listExclusionRules()
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows).toHaveLength(rules.length)
    for (const [index, rule] of rules.entries()) {
      expect(rows[index]).toHaveTextContent(rule.pattern)
      expect(rows[index]).toHaveTextContent(rule.pattern.startsWith('@') ? 'Domena' : 'Adresa')
      if (rule.note) expect(rows[index]).toHaveTextContent(rule.note)
    }
  })

  it('adds an address and a domain', async () => {
    const user = renderScreen(<ExclusionsSettings />)
    await list()
    for (const pattern of ['ana@primjer.hr', '@novo-primjer.hr']) {
      await user.click(screen.getByRole('button', { name: 'Dodaj isključenje' }))
      const sheet = await screen.findByRole('dialog')
      await user.type(within(sheet).getByLabelText(/Adresa ili domena/), pattern)
      await user.type(within(sheet).getByLabelText('Napomena'), 'Bilten')
      await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
      await screen.findAllByText('Isključenje je dodano.')
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    }
    const patterns = (await listExclusionRules()).map((r) => r.pattern)
    expect(patterns).toEqual(expect.arrayContaining(['ana@primjer.hr', '@novo-primjer.hr']))
  })

  it('refuses what the spec’s pattern refuses, next to the field, without a request', async () => {
    const user = renderScreen(<ExclusionsSettings />)
    await list()
    const before = (await listExclusionRules()).length
    await user.click(screen.getByRole('button', { name: 'Dodaj isključenje' }))
    const sheet = await screen.findByRole('dialog')
    for (const bad of ['primjer.hr', 'ana@', '@primjer', 'a b@primjer.hr', '@@primjer.hr']) {
      await user.clear(within(sheet).getByLabelText(/Adresa ili domena/))
      await user.type(within(sheet).getByLabelText(/Adresa ili domena/), bad)
      await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
      expect(
        await within(sheet).findByText(/Upišite adresu \(ime@primjer.hr\)/),
      ).toBeInTheDocument()
    }
    expect(await listExclusionRules()).toHaveLength(before)
  })

  it('shows a 400 of the API (a rule that already exists) next to the field', async () => {
    const user = renderScreen(<ExclusionsSettings />)
    await list()
    const [existing] = await listExclusionRules()
    if (!existing) throw new Error('seed')
    await user.click(screen.getByRole('button', { name: 'Dodaj isključenje' }))
    const sheet = await screen.findByRole('dialog')
    await user.type(within(sheet).getByLabelText(/Adresa ili domena/), existing.pattern)
    await user.click(within(sheet).getByRole('button', { name: 'Spremi' }))
    expect(await within(sheet).findByText('Već postoji.')).toBeInTheDocument()
  })

  it('removes a rule after a confirmation', async () => {
    const user = renderScreen(<ExclusionsSettings />)
    const [rule] = await listExclusionRules()
    if (!rule) throw new Error('seed')
    await list()
    await user.click(screen.getByRole('button', { name: `Obriši: ${rule.pattern}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Ukloniti isključenje?' })
    expect(await listExclusionRules()).toContainEqual(expect.objectContaining({ id: rule.id }))
    await user.click(within(dialog).getByRole('button', { name: 'Ukloni isključenje' }))
    await waitFor(async () => {
      expect(await listExclusionRules()).not.toContainEqual(
        expect.objectContaining({ id: rule.id }),
      )
    })
  })

  it('says so when there are none, and when they cannot be loaded', async () => {
    server.use(http.get(`${API}/sales/exclusions`, () => HttpResponse.json([])))
    renderScreen(<ExclusionsSettings />)
    expect(await screen.findByText('Još nema isključenja.')).toBeInTheDocument()
  })

  it('a failed load can be retried', async () => {
    server.use(
      http.get(`${API}/sales/exclusions`, () =>
        HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 }),
      ),
    )
    const user = renderScreen(<ExclusionsSettings />)
    expect(await screen.findByText('Isključenja nije moguće učitati.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovno' }))
    expect(await list()).toBeInTheDocument()
  })
})
