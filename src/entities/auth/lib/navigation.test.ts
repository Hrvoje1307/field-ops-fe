import { describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'

import { loginSearchFor, roleHome, safeRedirect, sessionEndReasonOf } from './navigation'

describe('roleHome', () => {
  it('sends technicians to the field view and the office to /', () => {
    expect(roleHome('technician')).toBe('/field')
    expect(roleHome('dispatcher')).toBe('/')
    expect(roleHome('owner')).toBe('/')
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/jobs', '/jobs'],
    ['/clients?q=ana#top', '/clients?q=ana#top'],
    ['/field', '/field'],
  ])('keeps the internal path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    'jobs',
    '/login',
    '/login?redirect=%2Fjobs',
    '/forgot-password',
    undefined,
    42,
  ])('drops %j', (input) => {
    expect(safeRedirect(input)).toBeUndefined()
  })
})

describe('loginSearchFor', () => {
  it('sends an own sign-out to plain /login', () => {
    expect(loginSearchFor('signed_out', '/jobs')).toEqual({})
  })

  it('keeps the page for expired sessions and sign-outs in other tabs', () => {
    expect(loginSearchFor('expired', '/jobs?page=2')).toEqual({
      redirect: '/jobs?page=2',
      reason: 'session_expired',
    })
    expect(loginSearchFor('other_tab', '/clients')).toEqual({
      redirect: '/clients',
      reason: 'signed_out_elsewhere',
    })
  })

  it('shows the revoked message without a redirect', () => {
    expect(loginSearchFor('revoked', '/jobs')).toEqual({ reason: 'access_revoked' })
  })
})

describe('sessionEndReasonOf', () => {
  it('treats 403 and the access_revoked code as revoked access', () => {
    expect(sessionEndReasonOf(new ApiError(403, { status: 403 }))).toBe('revoked')
    expect(
      sessionEndReasonOf(new ApiError(401, { status: 401, code: 'auth.access_revoked' })),
    ).toBe('revoked')
  })

  it('treats other 401s as an ended session', () => {
    expect(
      sessionEndReasonOf(new ApiError(401, { status: 401, code: 'auth.refresh_token_expired' })),
    ).toBe('expired')
  })

  it('leaves other errors to the error page', () => {
    expect(sessionEndReasonOf(new ApiError(500, { status: 500 }))).toBeNull()
    expect(sessionEndReasonOf(new TypeError('Failed to fetch'))).toBeNull()
  })
})
