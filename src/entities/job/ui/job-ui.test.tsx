import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { JobStatus } from '@/shared/api/generated/model'

import { JobNumber } from './job-number'
import { JobTypeTag } from './job-type-tag'
import { PriorityMark } from './priority-mark'
import { StatusBadge } from './status-badge'

const STATUSES: JobStatus[] = [
  'new',
  'scheduled',
  'confirmed',
  'en_route',
  'on_site',
  'on_hold',
  'completed',
  'invoiced',
  'cancelled',
]

describe('job display', () => {
  it('labels every status from i18n, each with its own colour', () => {
    const { container } = render(
      <>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    )
    const badges = [...container.querySelectorAll('[data-status]')]
    const labels = badges.map((badge) => badge.textContent)
    expect(labels).toEqual([
      'Novi',
      'Zakazan',
      'Potvrđen',
      'Na putu',
      'Na lokaciji',
      'Na čekanju',
      'Završen',
      'Fakturiran',
      'Otkazan',
    ])
    expect(new Set(badges.map((badge) => badge.className)).size).toBe(STATUSES.length)
  })

  it('marks urgent, high and low priority but not normal', () => {
    const { container, rerender } = render(<PriorityMark priority="normal" />)
    expect(container).toBeEmptyDOMElement()

    rerender(<PriorityMark priority="urgent" />)
    expect(screen.getByText('Hitno')).toBeVisible()

    rerender(<PriorityMark priority="high" iconOnly />)
    expect(screen.getByText('Visok prioritet')).toHaveClass('sr-only')
  })

  it('shows the number as returned and the job type with its colour', () => {
    render(
      <>
        <JobNumber number="RN-2026-0042" />
        <JobTypeTag jobType={{ name: 'Servis', color: '#22c55e' }} />
      </>,
    )
    expect(screen.getByText('RN-2026-0042')).toBeInTheDocument()
    const tag = screen.getByText('Servis')
    expect(tag.querySelector('[data-slot="color-dot"]')).toHaveStyle({
      backgroundColor: '#22c55e',
    })
  })
})
