import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TechnicianChip, TechnicianChips } from './technician-chip'

describe('TechnicianChip', () => {
  it('shows initials in the technician colour with readable text', () => {
    render(<TechnicianChip technician={{ id: 't1', fullName: 'Ivan Horvat', color: '#2563eb' }} />)
    const badge = screen.getByText('IH')
    expect(badge).toHaveStyle({ backgroundColor: '#2563eb', color: '#ffffff' })
    expect(screen.getByText('Ivan Horvat')).toBeVisible()
  })

  it('compact: name for screen readers and as a tooltip', () => {
    render(
      <TechnicianChip compact technician={{ id: 't1', fullName: 'Mia Barić', color: '#f59e0b' }} />,
    )
    expect(screen.getByText('Mia Barić')).toHaveClass('sr-only')
    expect(screen.getByTitle('Mia Barić')).toBeInTheDocument()
    expect(screen.getByText('MB')).toHaveStyle({ color: '#000000' })
  })

  it('lists the crew lead first and marks it', () => {
    render(
      <TechnicianChips
        technicians={[
          { id: 't1', fullName: 'Ivan Horvat', color: '#2563eb', isLead: false },
          { id: 't2', fullName: 'Luka Babić', color: '#16a34a', isLead: true },
        ]}
      />,
    )
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveTextContent('Luka Babić')
    expect(first?.querySelector('.sr-only:last-child')).toHaveTextContent('Voditelj')
    expect(second).not.toHaveTextContent('Voditelj')
  })
})
