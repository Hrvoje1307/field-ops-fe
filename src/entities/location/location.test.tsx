import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { locationAddress } from './lib/address'
import { mapsUrl } from './lib/maps'
import { AccessCodes } from './ui/access-codes'
import { MapsLink } from './ui/maps-link'

describe('location address and maps', () => {
  it('shows the API address; street and city only when the API left it out', () => {
    expect(locationAddress({ address: 'Ilica 1, Zagreb', street: 'x', city: 'y' })).toBe(
      'Ilica 1, Zagreb',
    )
    expect(locationAddress({ street: 'Vrbik 7', city: 'Zagreb' })).toBe('Vrbik 7, Zagreb')
  })

  it('links to coordinates when known, else to the address', () => {
    expect(mapsUrl({ address: 'Ilica 1, Zagreb', lat: 45.8, lng: 15.97 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.8%2C15.97',
    )
    expect(mapsUrl({ address: 'Ilica 1, Zagreb', lat: null, lng: null })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Ilica+1%2C+Zagreb',
    )
    expect(mapsUrl({ address: 'Ilica 1, Zagreb', lat: 0, lng: 0 }, { directions: true })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=0%2C0',
    )
  })

  it('opens maps in a new tab', () => {
    render(<MapsLink place={{ address: 'Ilica 1, Zagreb' }} />)
    const link = screen.getByRole('link', { name: 'Otvori u kartama' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('AccessCodes', () => {
  it('masks codes the viewer may see until revealed', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AccessCodes location={{ accessCodes: 'Kapija 2580', hasAccessCodes: true }} />,
    )
    expect(container).not.toHaveTextContent('Kapija 2580')
    await user.click(screen.getByRole('button', { name: 'Prikaži: Pristupne šifre' }))
    expect(container).toHaveTextContent('Kapija 2580')
  })

  it('says codes exist when the API withheld them', () => {
    render(<AccessCodes location={{ hasAccessCodes: true }} />)
    expect(screen.getByText('Pristupne šifre su skrivene.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing when there are no codes', () => {
    const { container } = render(
      <AccessCodes location={{ accessCodes: null, hasAccessCodes: false }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
