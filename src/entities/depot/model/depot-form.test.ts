import { describe, expect, it } from 'vitest'

import { buildDepotSchema, depotFormValues, type DepotFormValues, toDepotBody } from './depot-form'

const valid: DepotFormValues = {
  name: 'Skladište',
  address: 'Ulica 1, Zagreb',
  opensAt: '07:00',
  closesAt: '16:00',
  lat: '45.8131',
  lng: '15.9775',
}

const messages = (change: Partial<DepotFormValues>) => {
  const result = buildDepotSchema().safeParse({ ...valid, ...change })
  const found: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) found[String(issue.path[0])] = issue.message
  }
  return found
}

describe('depot form', () => {
  it('a complete depot is valid, with or without coordinates', () => {
    expect(messages({})).toEqual({})
    expect(messages({ lat: '', lng: '' })).toEqual({})
  })

  it('needs a name and an address', () => {
    expect(messages({ name: ' ', address: '' })).toEqual({
      name: 'Upišite naziv.',
      address: 'Upišite adresu.',
    })
  })

  it('needs working hours in order', () => {
    expect(messages({ opensAt: '7', closesAt: '' })).toEqual({
      opensAt: 'Upišite vrijeme, npr. 07:00.',
      closesAt: 'Upišite vrijeme, npr. 07:00.',
    })
    expect(messages({ opensAt: '16:00', closesAt: '07:00' })).toEqual({
      closesAt: 'Radno vrijeme mora završiti nakon početka.',
    })
    expect(messages({ opensAt: '07:00', closesAt: '07:00' }).closesAt).toBeDefined()
  })

  it('takes coordinates with a point or a comma, within the globe', () => {
    expect(messages({ lat: '45,8131', lng: '-15,9' })).toEqual({})
    expect(messages({ lat: '91' })).toEqual({ lat: 'Širina je broj od −90 do 90.' })
    expect(messages({ lng: '181' })).toEqual({ lng: 'Dužina je broj od −180 do 180.' })
    expect(messages({ lat: 'sjever' }).lat).toBeDefined()
  })

  it('coordinates come as a pair', () => {
    expect(messages({ lng: '' })).toEqual({ lng: 'Upišite obje koordinate ili nijednu.' })
    expect(messages({ lat: '' })).toEqual({ lat: 'Upišite obje koordinate ili nijednu.' })
  })

  it('starts with office hours for a new depot and the stored values for an old one', () => {
    expect(depotFormValues()).toEqual({
      name: '',
      address: '',
      opensAt: '07:00',
      closesAt: '17:00',
      lat: '',
      lng: '',
    })
    expect(
      depotFormValues({
        id: '1',
        name: 'A',
        address: 'B',
        opensAt: '06:00',
        closesAt: '14:00',
        lat: 45.5,
        lng: null,
      }),
    ).toMatchObject({ opensAt: '06:00', lat: '45.5', lng: '' })
  })

  it('sends numbers for coordinates and null when there are none', () => {
    expect(toDepotBody({ ...valid, lat: '45,5', lng: ' 15.25 ' })).toEqual({
      name: 'Skladište',
      address: 'Ulica 1, Zagreb',
      opensAt: '07:00',
      closesAt: '16:00',
      lat: 45.5,
      lng: 15.25,
    })
    expect(toDepotBody({ ...valid, lat: '', lng: '' })).toMatchObject({ lat: null, lng: null })
  })
})
