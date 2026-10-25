import { describe, expect, it } from 'vitest'

import { MESSAGE_PENDING_MAX_AGE_MS } from '../const'
import { canReach, recipientsOf } from './recipients'
import { isFailure, isOnItsWay } from './status'

const NOW = Date.parse('2026-10-15T08:00:00Z')
const at = (ms: number) => new Date(NOW - ms).toISOString()

describe('isOnItsWay', () => {
  it('queued and sent are on their way, delivered and failed are not', () => {
    expect(isOnItsWay({ status: 'queued', createdAt: at(1000) }, NOW)).toBe(true)
    expect(isOnItsWay({ status: 'sent', createdAt: at(1000) }, NOW)).toBe(true)
    for (const status of ['delivered', 'failed', 'undeliverable'] as const) {
      expect(isOnItsWay({ status, createdAt: at(1000) }, NOW)).toBe(false)
    }
  })

  it('one that has been on its way for ten minutes is stuck, and left alone', () => {
    expect(isOnItsWay({ status: 'sent', createdAt: at(MESSAGE_PENDING_MAX_AGE_MS - 1) }, NOW)).toBe(
      true,
    )
    expect(isOnItsWay({ status: 'sent', createdAt: at(MESSAGE_PENDING_MAX_AGE_MS + 1) }, NOW)).toBe(
      false,
    )
  })
})

describe('isFailure', () => {
  it('is failed and undeliverable', () => {
    expect(isFailure({ status: 'failed' })).toBe(true)
    expect(isFailure({ status: 'undeliverable' })).toBe(true)
    expect(isFailure({ status: 'delivered' })).toBe(false)
  })
})

describe('recipients', () => {
  const ana = { id: 'a', phone: '+385911', email: null, receivesSms: true }
  const ivo = { id: 'i', phone: '+385922', email: 'ivo@x.hr', receivesSms: false }
  const eva = { id: 'e', phone: null, email: 'eva@x.hr', receivesSms: true }

  it('can reach by the number for SMS and the address for e-mail', () => {
    expect(canReach(ana, 'sms')).toBe(true)
    expect(canReach(ana, 'email')).toBe(false)
    expect(canReach(eva, 'email')).toBe(true)
    expect(canReach(eva, 'sms')).toBe(false)
  })

  it('without a choice: everyone reachable, and for SMS only those who want texts', () => {
    expect(recipientsOf([ana, ivo, eva], 'sms', '').map((c) => c.id)).toEqual(['a'])
    expect(recipientsOf([ana, ivo, eva], 'email', '').map((c) => c.id)).toEqual(['i', 'e'])
  })

  it('with a choice: that contact, whatever they want', () => {
    expect(recipientsOf([ana, ivo, eva], 'sms', 'i').map((c) => c.id)).toEqual(['i'])
  })
})
