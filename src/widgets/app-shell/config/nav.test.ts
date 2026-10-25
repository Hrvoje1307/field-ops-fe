import { describe, expect, it } from 'vitest'

import { navFor } from './nav'

describe('navFor', () => {
  it('gives the owner the settings and the dispatcher the day, jobs and clients', () => {
    expect(navFor('owner').map((item) => item.to)).toEqual(['/', '/jobs', '/clients', '/settings'])
    expect(navFor('dispatcher').map((item) => item.to)).toEqual(['/', '/jobs', '/clients'])
  })
})
