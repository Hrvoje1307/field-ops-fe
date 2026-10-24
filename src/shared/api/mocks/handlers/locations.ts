import type { GeocodeBody, LocationInput } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { LocationRow } from '../db/rows'
import { getRow, isOpenStatus, OFFICE_ROLES, viewerOf } from '../lib/access'
import { newId } from '../lib/ids'
import { applyLocationInput, fakeGeocode } from '../lib/inputs'
import { presentLocation } from '../lib/present'
import { conflict, created, FieldErrors, noContent, ok } from '../lib/problems'
import { route } from '../lib/route'

export const locationHandlers = [
  route(
    'get',
    '/clients/{id}/locations',
    ({ auth, params }) => {
      const client = getRow(auth.t.clients, params.id)
      return ok(
        auth.t.locations
          .filter((l) => l.clientId === client.id && !l.deletedAt)
          .map((l) => presentLocation(auth.t, l, viewerOf(auth))),
      )
    },
    { roles: OFFICE_ROLES },
  ),

  route<LocationInput>(
    'post',
    '/clients/{id}/locations',
    ({ auth, body, params }) => {
      const client = getRow(auth.t.clients, params.id)
      const errors = new FieldErrors()
      const fields = applyLocationInput(auth.t, body, errors, { path: '' })
      errors.throwIfAny()
      const now = toIsoInstant(Date.now())
      const location: LocationRow = {
        id: newId(),
        clientId: client.id,
        ...fields,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      auth.t.locations.push(location)
      return created(presentLocation(auth.t, location, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/locations/{id}',
    ({ auth, params }) =>
      ok(presentLocation(auth.t, getRow(auth.t.locations, params.id), viewerOf(auth))),
    { roles: OFFICE_ROLES },
  ),

  route<LocationInput>(
    'put',
    '/locations/{id}',
    ({ auth, body, params }) => {
      const location = getRow(auth.t.locations, params.id)
      const errors = new FieldErrors()
      const fields = applyLocationInput(auth.t, body, errors, {
        path: '',
        previous: location,
      })
      errors.throwIfAny()
      Object.assign(location, fields, { updatedAt: toIsoInstant(Date.now()) })
      return ok(presentLocation(auth.t, location, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/locations/{id}',
    ({ auth, params }) => {
      const location = getRow(auth.t.locations, params.id)
      if (
        auth.t.jobs.some(
          (j) => j.locationId === location.id && !j.deletedAt && isOpenStatus(j.status),
        )
      ) {
        throw conflict('location.has_open_jobs', 'The location has open jobs.')
      }
      location.deletedAt = toIsoInstant(Date.now())
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  route<GeocodeBody>(
    'post',
    '/geocode',
    ({ body }) => {
      const { lat, lng } = fakeGeocode(body.street, body.city)
      const formatted = [
        body.street,
        [body.postalCode, body.city].filter(Boolean).join(' '),
        body.country ?? 'HR',
      ]
        .filter(Boolean)
        .join(', ')
      return ok([{ formatted, lat, lng }])
    },
    { roles: OFFICE_ROLES },
  ),
]
