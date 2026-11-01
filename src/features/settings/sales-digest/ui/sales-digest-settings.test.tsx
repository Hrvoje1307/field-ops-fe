import { screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSalesSettings } from '@/entities/sales-config'
import { listMembers, memberHasSalesAccess } from '@/entities/member'
import { getDb } from '@/shared/api/mocks/db'
import { alarmkoSales, renderScreen, signInAs } from '@/shared/api/test/screen-test-utils'

import { SalesDigestSettings } from './sales-digest-settings'

beforeEach(async () => {
  await signInAs()
})

afterEach(() => {
  toast.dismiss()
})

const form = () => screen.findByRole('form', { name: 'Dnevni sažetak' })
const save = () => screen.getByRole('button', { name: 'Spremi' })
const withAccess = async () =>
  (await listMembers()).filter((m) => m.isActive && memberHasSalesAccess(m))

describe('SalesDigestSettings', () => {
  it('shows the time in the tenant zone and lists only the members who have access to Prodaja', async () => {
    renderScreen(<SalesDigestSettings />)
    await form()
    expect(screen.getByLabelText('Vrijeme slanja')).toHaveValue('07:45')
    expect(screen.getByText(/Europe\/Zagreb/)).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Primatelji' })
    const members = await withAccess()
    expect(within(group).getAllByRole('checkbox')).toHaveLength(members.length)
    for (const member of members) {
      expect(within(group).getByRole('checkbox', { name: member.fullName })).toBeInTheDocument()
    }
  })

  it('saves its own fields and leaves the knowledge and the tone as the record has them now', async () => {
    alarmkoSales().settings.digestRecipientIds = []
    const user = renderScreen(<SalesDigestSettings />)
    await form()
    // The AI screen (or another owner) saved these after this screen loaded
    alarmkoSales().settings.knowledge = 'Cjenik 2026'
    alarmkoSales().settings.tone = 'friendly'
    const [first] = await withAccess()
    if (!first) throw new Error('seed')
    await user.clear(screen.getByLabelText('Vrijeme slanja'))
    await user.type(screen.getByLabelText('Vrijeme slanja'), '09:30')
    await user.click(screen.getByRole('checkbox', { name: first.fullName }))
    await user.click(save())
    expect(await screen.findByText('Postavke su spremljene.')).toBeInTheDocument()
    expect(await getSalesSettings()).toMatchObject({
      digestTime: '09:30',
      digestRecipientIds: [first.userId],
      knowledge: 'Cjenik 2026',
      tone: 'friendly',
    })
  })

  it('turning off the keeping of non-sales content deletes it, so it needs a confirmation', async () => {
    alarmkoSales().settings.storeNonSalesBodies = true
    const user = renderScreen(<SalesDigestSettings />)
    await form()
    await user.click(
      screen.getByRole('checkbox', { name: /Čuvaj sadržaj razgovora koji nisu prodaja/ }),
    )
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'Spremiti i obrisati sadržaj?' })
    expect(dialog).toHaveTextContent('briše se spremljeni sadržaj razgovora koji nisu prodaja')
    expect(alarmkoSales().settings.storeNonSalesBodies).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Spremi i obriši' }))
    await waitFor(() => {
      expect(alarmkoSales().settings.storeNonSalesBodies).toBe(false)
    })
  })

  it('turning it on, or switching the digest off, needs no confirmation', async () => {
    alarmkoSales().settings.storeNonSalesBodies = false
    const user = renderScreen(<SalesDigestSettings />)
    await form()
    await user.click(
      screen.getByRole('checkbox', { name: /Čuvaj sadržaj razgovora koji nisu prodaja/ }),
    )
    await user.click(screen.getByRole('checkbox', { name: 'Šalji dnevni sažetak' }))
    await user.click(save())
    await screen.findByText('Postavke su spremljene.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(alarmkoSales().settings).toMatchObject({
      storeNonSalesBodies: true,
      digestEnabled: false,
    })
  })

  it('a recipient who no longer has access is shown with a mark and removed on saving', async () => {
    const [first, second] = await withAccess()
    if (!first || !second) throw new Error('seed')
    alarmkoSales().settings.digestRecipientIds = [first.userId, second.userId]
    // The second member loses access to Prodaja
    const membership = getDb().memberships.find(
      (m) => m.userId === second.userId && m.canAccessSales,
    )
    if (!membership) throw new Error('seed')
    membership.canAccessSales = false
    const user = renderScreen(<SalesDigestSettings />)
    await form()
    const stale = screen.getByText('Nema više pristup prodaji')
    expect(stale.closest('li')).toHaveTextContent(second.fullName)
    expect(screen.getByRole('note')).toHaveTextContent('bit će maknuti pri spremanju')
    await user.click(save())
    await screen.findByText('Postavke su spremljene.')
    expect((await getSalesSettings()).digestRecipientIds).toEqual([first.userId])
    expect(screen.queryByText('Nema više pristup prodaji')).not.toBeInTheDocument()
  })
})
