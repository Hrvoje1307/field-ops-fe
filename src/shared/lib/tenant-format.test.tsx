import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useTenantFormat } from './tenant-format'
import { TenantFormatProvider } from './tenant-format-provider'

function Sample() {
  const f = useTenantFormat()
  return (
    <dl>
      <dt>time</dt>
      <dd data-testid="time">{f.formatTime('2026-11-01T06:30:00Z')}</dd>
      <dt>money</dt>
      <dd data-testid="money">{f.formatMoney('1234.50')}</dd>
      <dt>phone</dt>
      <dd data-testid="phone">{f.formatPhone('+12125550123')}</dd>
      <dt>zone</dt>
      <dd data-testid="zone">{f.timeZone}</dd>
    </dl>
  )
}

describe('useTenantFormat', () => {
  it('uses the provided tenant settings (New York tenant)', () => {
    render(
      <TenantFormatProvider
        settings={{ timeZone: 'America/New_York', locale: 'en-US', currency: 'USD', country: 'US' }}
      >
        <Sample />
      </TenantFormatProvider>,
    )
    // 06:30Z on the DST fall-back day is 01:30 EST
    expect(screen.getByTestId('time')).toHaveTextContent('01:30')
    expect(screen.getByTestId('money')).toHaveTextContent('$1,234.50')
    expect(screen.getByTestId('phone')).toHaveTextContent('(212) 555-0123')
  })

  it('falls back to Croatian defaults outside a provider', () => {
    render(<Sample />)
    expect(screen.getByTestId('zone')).toHaveTextContent('Europe/Zagreb')
    expect(screen.getByTestId('time')).toHaveTextContent('07:30')
    expect(screen.getByTestId('money')).toHaveTextContent('1.234,50 €')
    // A US number in a Croatian tenant stays E.164
    expect(screen.getByTestId('phone')).toHaveTextContent('+12125550123')
  })
})
