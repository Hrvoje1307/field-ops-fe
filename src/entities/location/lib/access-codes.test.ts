import { describe, expect, it } from 'vitest'

import { accessCodesForRequest, accessCodesFormValue } from './access-codes'

describe('access codes in an edit form', () => {
  it('stored codes start masked; none stored starts as an empty input', () => {
    expect(accessCodesFormValue({ accessCodes: '1234#', hasAccessCodes: true })).toEqual({
      masked: true,
      hadValue: true,
      value: '1234#',
    })
    expect(accessCodesFormValue({ accessCodes: null, hasAccessCodes: false })).toEqual({
      masked: false,
      hadValue: false,
      value: '',
    })
    expect(accessCodesFormValue(undefined)).toEqual({ masked: false, hadValue: false, value: '' })
  })

  it('masked: kept (null); revealed: text replaces, emptied removes ("")', () => {
    expect(accessCodesForRequest({ masked: true, hadValue: true, value: '1234#' })).toBeNull()
    expect(accessCodesForRequest({ masked: false, hadValue: true, value: ' 1234# ' })).toBe('1234#')
    expect(accessCodesForRequest({ masked: false, hadValue: true, value: '9999' })).toBe('9999')
    expect(accessCodesForRequest({ masked: false, hadValue: true, value: '  ' })).toBe('')
  })

  it('none stored and left empty: nothing to remove (null)', () => {
    expect(accessCodesForRequest({ masked: false, hadValue: false, value: '' })).toBeNull()
  })

  it('codes exist but this viewer gets no text: masked, so never cleared by accident', () => {
    const value = accessCodesFormValue({ hasAccessCodes: true })
    expect(value.masked).toBe(true)
    expect(accessCodesForRequest(value)).toBeNull()
  })
})
