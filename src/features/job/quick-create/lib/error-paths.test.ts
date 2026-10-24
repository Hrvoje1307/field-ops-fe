import { describe, expect, it } from 'vitest'

import { clientErrorPath, jobErrorPath, locationErrorPath, toFormErrors } from './error-paths'

describe('server error paths → form fields', () => {
  it('POST /clients: contact, first location and custom fields', () => {
    const person = { isCompany: false }
    expect(clientErrorPath('name', person)).toBe('client.name')
    expect(clientErrorPath('contacts[0].phone', person)).toBe('client.phone')
    expect(clientErrorPath('contacts[0].email', person)).toBe('client.email')
    expect(clientErrorPath('contacts[0].name', person)).toBe('client.name')
    expect(clientErrorPath('contacts[0].name', { isCompany: true })).toBe('client.contactName')
    expect(clientErrorPath('firstLocation.street', person)).toBe('location.street')
    expect(clientErrorPath('firstLocation.customFields.floor', person)).toBe(
      'location.customFields.floor',
    )
    expect(clientErrorPath('customFields.ref', person)).toBe('client.customFields.ref')
  })

  it('POST /clients/{id}/locations and POST /jobs', () => {
    expect(locationErrorPath('city')).toBe('location.city')
    expect(jobErrorPath('title')).toBe('job.title')
    expect(jobErrorPath('customFields.reference')).toBe('job.customFields.reference')
    expect(jobErrorPath('locationId')).toBe('location.locationId')
    expect(jobErrorPath('clientId')).toBe('client.clientId')
    expect(jobErrorPath('assetId')).toBe('assetId')
  })

  it('re-keys the errors, joining messages that land on the same field', () => {
    expect(
      toFormErrors({ 'contacts[0].name': ['A'], name: ['B'] }, (path) =>
        clientErrorPath(path, { isCompany: false }),
      ),
    ).toEqual({ 'client.name': ['A', 'B'] })
  })
})
