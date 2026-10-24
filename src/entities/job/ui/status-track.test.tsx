import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { StatusHistoryEntry } from '@/shared/api/generated/model'

import { StatusTrack } from './status-track'

const entry = (
  toStatus: StatusHistoryEntry['toStatus'],
  changedAt: string,
): StatusHistoryEntry => ({
  id: changedAt,
  toStatus,
  actor: 'user',
  changedAt,
})

describe('StatusTrack', () => {
  it('lists the usual path with the current step and times in the tenant zone', () => {
    render(
      <StatusTrack
        status="scheduled"
        history={[entry('new', '2026-10-20T07:15:00Z'), entry('scheduled', '2026-10-20T07:45:00Z')]}
      />,
    )
    const track = screen.getByRole('list', { name: 'Tijek naloga' })
    const steps = within(track).getAllByRole('listitem')
    expect(steps.map((step) => step.querySelector('span > span')?.textContent)).toEqual([
      'Novi',
      'Zakazan',
      'Potvrđen',
      'Na putu',
      'Na lokaciji',
      'Završen',
      'Fakturiran',
    ])
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    // Zagreb (default tenant zone) is UTC+2 in October
    expect(steps[1]).toHaveTextContent('09:45')
    expect(screen.queryByTestId('off-track')).not.toBeInTheDocument()
  })

  it('says which steps were skipped', () => {
    render(
      <StatusTrack
        status="en_route"
        history={[
          entry('new', '2026-10-20T07:00:00Z'),
          entry('scheduled', '2026-10-20T08:00:00Z'),
          entry('en_route', '2026-10-20T09:00:00Z'),
        ]}
      />,
    )
    const confirmed = screen.getByText('Potvrđen').closest('li')
    expect(confirmed).toHaveAttribute('data-state', 'skipped')
    expect(confirmed).toHaveTextContent('preskočeno')
  })

  it('shows on hold and cancelled off the track, with the reason', () => {
    render(
      <StatusTrack
        status="on_hold"
        reason="Čeka se rezervni dio."
        history={[entry('new', '2026-10-20T07:00:00Z'), entry('on_hold', '2026-10-20T09:00:00Z')]}
      />,
    )
    const offTrack = screen.getByTestId('off-track')
    expect(offTrack).toHaveTextContent('Na čekanju')
    expect(offTrack).toHaveTextContent('Razlog čekanja: Čeka se rezervni dio.')
    expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
  })
})
