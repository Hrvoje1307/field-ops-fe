import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import type { CustomFieldValues } from '@/shared/api/generated/model'
import { formatDate } from '@/shared/lib/datetime'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'

import { ALL_TYPES } from '../model/definitions.fixture'
import { CustomFieldValuesView } from './custom-field-values-view'

const NEW_YORK = {
  timeZone: 'America/New_York',
  locale: 'en-US',
  currency: 'USD',
  country: 'US',
} as const

function view(values: CustomFieldValues, wrap?: (children: ReactNode) => ReactNode) {
  const content = <CustomFieldValuesView definitions={[...ALL_TYPES].reverse()} values={values} />
  return render(wrap ? wrap(content) : content)
}

/** The <dd> next to the label's <dt>. */
const valueOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

describe('CustomFieldValuesView', () => {
  it('formats every type for the tenant and shows option labels', () => {
    view({
      note: 'Ulaz iz dvorišta',
      details: 'Prvi red\nDrugi red',
      size: 1234.5,
      due: '2026-10-24',
      level: 'full',
      tags: ['c', 'a'],
      confirmed: false,
    })
    expect(valueOf('Napomena')).toHaveTextContent('Ulaz iz dvorišta')
    expect(valueOf('Opis')?.firstElementChild).toHaveClass('whitespace-pre-line')
    expect(valueOf('Veličina')).toHaveTextContent('1.234,5')
    expect(valueOf('Rok')).toHaveTextContent(formatDate('2026-10-24', { locale: 'hr-HR' }))
    expect(valueOf('Razina')).toHaveTextContent('Puna')
    expect(valueOf('Oznake')).toHaveTextContent('Treća, Prva')
    expect(valueOf('Potvrđeno')).toHaveTextContent('Ne')
  })

  it('lists fields in sortOrder; empty ones show a dash', () => {
    view({})
    const labels = [...document.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(labels).toEqual([
      'Napomena',
      'Opis',
      'Veličina',
      'Rok',
      'Razina',
      'Oznake',
      'Potvrđeno',
      'Tajni kod',
    ])
    expect(valueOf('Napomena')).toHaveTextContent('—Nije upisano')
    expect(valueOf('Tajni kod')).toHaveTextContent('—Nije upisano')
  })

  it('shows a removed option as stored', () => {
    view({ level: 'premium', tags: ['a', 'gone'] })
    expect(valueOf('Razina')).toHaveTextContent('premium')
    expect(valueOf('Oznake')).toHaveTextContent('Prva, gone')
  })

  it('uses the tenant locale', () => {
    view({ size: 1234.5, due: '2026-10-24', confirmed: true }, (children) => (
      <TenantFormatProvider settings={NEW_YORK}>{children}</TenantFormatProvider>
    ))
    expect(valueOf('Veličina')).toHaveTextContent('1,234.5')
    expect(valueOf('Rok')).toHaveTextContent('Oct 24, 2026')
    expect(valueOf('Potvrđeno')).toHaveTextContent('Da')
  })

  it('masks sensitive values, out of the page until revealed', async () => {
    const user = userEvent.setup()
    const { container } = view({ secret: '4471' })
    expect(container).not.toHaveTextContent('4471')
    await user.click(screen.getByRole('button', { name: 'Prikaži: Tajni kod' }))
    expect(valueOf('Tajni kod')).toHaveTextContent('4471')
  })
})
