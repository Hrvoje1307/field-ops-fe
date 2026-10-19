import type { AssetInput, AssetTypeInput } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { AssetRow, TenantData } from '../db/rows'
import {
  ALL_ROLES,
  canSeeLocationSecrets,
  getRow,
  OFFICE_ROLES,
  viewerOf,
  type Viewer,
} from '../lib/access'
import { validateCustomFields } from '../lib/custom-fields'
import { newId } from '../lib/ids'
import { presentAsset } from '../lib/present'
import { conflict, created, FieldErrors, MESSAGES, noContent, notFound, ok } from '../lib/problems'
import { route } from '../lib/route'

function assetFields(
  t: TenantData,
  body: AssetInput,
  viewer: Viewer,
  locationId: string,
  previous?: AssetRow,
) {
  const errors = new FieldErrors()
  if (!t.assetTypes.some((a) => a.id === body.assetTypeId))
    errors.add('assetTypeId', MESSAGES.notFound)
  const customFields = validateCustomFields(t, 'asset', body.customFields, errors, {
    path: 'customFields',
    assetTypeId: body.assetTypeId,
    previous: previous?.customFields,
    canSeeSensitive: canSeeLocationSecrets(t, viewer, locationId),
  })
  errors.throwIfAny()
  return {
    assetTypeId: body.assetTypeId,
    manufacturer: body.manufacturer ?? null,
    model: body.model ?? null,
    serialNo: body.serialNo ?? null,
    installedAt: body.installedAt ?? null,
    warrantyUntil: body.warrantyUntil ?? null,
    notes: body.notes ?? null,
    customFields,
  }
}

export const assetHandlers = [
  route(
    'get',
    '/locations/{id}/assets',
    ({ auth, params }) => {
      const location = getRow(auth.t.locations, params.id)
      return ok(
        auth.t.assets
          .filter((a) => a.locationId === location.id && !a.deletedAt)
          .map((a) => presentAsset(auth.t, a, viewerOf(auth))),
      )
    },
    { roles: OFFICE_ROLES },
  ),

  route<AssetInput>(
    'post',
    '/locations/{id}/assets',
    ({ auth, body, params }) => {
      const location = getRow(auth.t.locations, params.id)
      const fields = assetFields(auth.t, body, viewerOf(auth), location.id)
      const now = toIsoInstant(Date.now())
      const asset: AssetRow = {
        id: newId(),
        locationId: location.id,
        ...fields,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      auth.t.assets.push(asset)
      return created(presentAsset(auth.t, asset, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/assets/{id}',
    ({ auth, params }) =>
      ok(presentAsset(auth.t, getRow(auth.t.assets, params.id), viewerOf(auth))),
    { roles: OFFICE_ROLES },
  ),

  route<AssetInput>(
    'put',
    '/assets/{id}',
    ({ auth, body, params }) => {
      const asset = getRow(auth.t.assets, params.id)
      const fields = assetFields(auth.t, body, viewerOf(auth), asset.locationId, asset)
      Object.assign(asset, fields, { updatedAt: toIsoInstant(Date.now()) })
      return ok(presentAsset(auth.t, asset, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/assets/{id}',
    ({ auth, params }) => {
      getRow(auth.t.assets, params.id).deletedAt = toIsoInstant(Date.now())
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  // --- asset types ---
  route('get', '/asset-types', ({ auth }) => ok(auth.t.assetTypes), { roles: ALL_ROLES }),

  route<AssetTypeInput>(
    'post',
    '/asset-types',
    ({ auth, body }) => {
      const assetType = { id: newId(), name: body.name.trim(), icon: body.icon ?? null }
      auth.t.assetTypes.push(assetType)
      return created(assetType)
    },
    { roles: OFFICE_ROLES },
  ),

  route<AssetTypeInput>(
    'put',
    '/asset-types/{id}',
    ({ auth, body, params }) => {
      const assetType = auth.t.assetTypes.find((a) => a.id === params.id)
      if (!assetType) throw notFound()
      Object.assign(assetType, { name: body.name.trim(), icon: body.icon ?? null })
      return ok(assetType)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/asset-types/{id}',
    ({ auth, params }) => {
      if (!auth.t.assetTypes.some((a) => a.id === params.id)) throw notFound()
      if (auth.t.assets.some((a) => a.assetTypeId === params.id && !a.deletedAt)) {
        throw conflict('asset_type.in_use', 'Equipment of this type still exists.')
      }
      auth.t.assetTypes = auth.t.assetTypes.filter((a) => a.id !== params.id)
      auth.t.customFields = auth.t.customFields.filter((f) => f.assetTypeId !== params.id)
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),
]
