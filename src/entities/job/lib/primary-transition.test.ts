import { describe, expect, it } from 'vitest'

import { splitTransitions } from './primary-transition'

describe('splitTransitions', () => {
  it("technician's changes: the next step is primary, on hold goes under more", () => {
    expect(splitTransitions('scheduled', ['en_route'])).toEqual({ primary: 'en_route', more: [] })
    expect(splitTransitions('confirmed', ['en_route'])).toEqual({ primary: 'en_route', more: [] })
    expect(splitTransitions('en_route', ['on_site'])).toEqual({ primary: 'on_site', more: [] })
    expect(splitTransitions('on_site', ['on_hold', 'completed'])).toEqual({
      primary: null,
      more: ['on_hold'],
    })
  })

  it('office changes: the nearest step forward is primary, going back is not', () => {
    expect(splitTransitions('scheduled', ['confirmed', 'en_route', 'new', 'cancelled'])).toEqual({
      primary: 'confirmed',
      more: ['en_route', 'new', 'cancelled'],
    })
  })

  it('off the usual path nothing is "forward"; completed is never offered', () => {
    expect(splitTransitions('on_hold', ['new', 'scheduled', 'cancelled'])).toEqual({
      primary: null,
      more: ['new', 'scheduled', 'cancelled'],
    })
    expect(splitTransitions('on_site', ['completed'])).toEqual({ primary: null, more: [] })
    expect(splitTransitions('invoiced', [])).toEqual({ primary: null, more: [] })
  })
})
