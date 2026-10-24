import { render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const NEW_YORK = {
  timeZone: 'America/New_York',
  locale: 'en-US',
  currency: 'USD',
  country: 'US',
} as const

function formatFor(settings: typeof NEW_YORK | undefined) {
  const wrapper = settings
    ? ({ children }: { children: ReactNode }) => (
        <TenantFormatProvider settings={settings}>{children}</TenantFormatProvider>
      )
    : undefined
  return renderHook(() => useTenantFormat(), { wrapper }).result.current
}

describe('relative day, duration and number', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts days from today in the tenant zone, not the browser zone', () => {
    // 02:30Z is still the evening before in New York, already the next day in Zagreb
    vi.useFakeTimers({ now: new Date('2026-10-25T02:30:00Z'), toFake: ['Date'] })
    const newYork = formatFor(NEW_YORK)
    expect(newYork.formatRelativeDay('2026-10-24')).toBe('Danas')
    expect(newYork.formatRelativeDay('2026-10-25')).toBe('Sutra')
    expect(newYork.formatRelativeDay('2026-10-23')).toBe('Jučer')

    const zagreb = formatFor(undefined)
    expect(zagreb.formatRelativeDay('2026-10-25')).toBe('Danas')
    expect(zagreb.formatRelativeDay('2026-10-24')).toBe('Jučer')
  })

  it('formats an instant as relative day and time in the tenant zone', () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T02:30:00Z'), toFake: ['Date'] })
    expect(formatFor(NEW_YORK).formatRelativeDateTime('2026-10-24T22:30:00Z')).toBe('Danas u 18:30')
    expect(formatFor(undefined).formatRelativeDateTime('2026-10-24T22:30:00Z')).toBe(
      'Danas u 00:30',
    )
    expect(formatFor(NEW_YORK).formatRelativeDateTime('2026-10-23T12:00:00Z')).toBe('Jučer u 08:00')
  })

  it('works across the DST change and shows other days with the weekday', () => {
    // New York falls back on 2026-11-01
    vi.useFakeTimers({ now: new Date('2026-10-31T23:30:00-04:00'), toFake: ['Date'] })
    const newYork = formatFor(NEW_YORK)
    expect(newYork.formatRelativeDay('2026-11-01')).toBe('Sutra')
    expect(newYork.formatRelativeDay('2026-11-02')).toBe('Mon, 11/2')

    vi.setSystemTime(new Date('2026-11-01T23:30:00-05:00'))
    expect(formatFor(NEW_YORK).formatRelativeDay('2026-11-01')).toBe('Danas')
    expect(formatFor(undefined).formatRelativeDay('2026-10-30')).toBe('pet, 30. 10.')
  })

  it('formats durations and numbers in the tenant locale', () => {
    expect(formatFor(NEW_YORK).formatDuration(90)).toBe('1 hr 30 min')
    expect(formatFor(undefined).formatDuration(90)).toBe('1 h 30 min')
    expect(formatFor(NEW_YORK).formatNumber(6.1)).toBe('6.1')
    expect(formatFor(undefined).formatNumber(6.1)).toBe('6,1')
  })
})
