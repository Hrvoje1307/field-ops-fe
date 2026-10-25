import { z } from 'zod'

import type { Depot, DepotInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface DepotFormValues {
  name: string
  address: string
  opensAt: string
  closesAt: string
  lat: string
  lng: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const text = () => z.string().trim()

/** A decimal with a point or a comma, the way people type coordinates. */
const toNumber = (value: string) => Number(value.trim().replace(',', '.'))

export function buildDepotSchema() {
  const t = i18n.t.bind(i18n)
  const coordinate = (limit: number, message: string) =>
    text().refine((value) => {
      if (value === '') return true
      const number = toNumber(value)
      return /^-?\d+([.,]\d+)?$/.test(value) && Math.abs(number) <= limit
    }, message)
  return z
    .object({
      name: text().min(1, t('settings.depots.errors.nameRequired')),
      address: text().min(1, t('settings.depots.errors.addressRequired')),
      opensAt: text().regex(TIME, t('settings.depots.errors.timeInvalid')),
      closesAt: text().regex(TIME, t('settings.depots.errors.timeInvalid')),
      lat: coordinate(90, t('settings.depots.errors.latInvalid')),
      lng: coordinate(180, t('settings.depots.errors.lngInvalid')),
    })
    .superRefine((values, context) => {
      if (
        TIME.test(values.opensAt) &&
        TIME.test(values.closesAt) &&
        values.closesAt <= values.opensAt
      ) {
        context.addIssue({
          code: 'custom',
          path: ['closesAt'],
          message: t('settings.depots.errors.closesBeforeOpens'),
        })
      }
      // A point needs both coordinates
      if ((values.lat === '') !== (values.lng === '')) {
        context.addIssue({
          code: 'custom',
          path: [values.lat === '' ? 'lat' : 'lng'],
          message: t('settings.depots.errors.coordinatesBoth'),
        })
      }
    })
}

export function depotFormValues(depot?: Depot): DepotFormValues {
  return {
    name: depot?.name ?? '',
    address: depot?.address ?? '',
    opensAt: depot?.opensAt ?? '07:00',
    closesAt: depot?.closesAt ?? '17:00',
    lat: depot?.lat == null ? '' : String(depot.lat),
    lng: depot?.lng == null ? '' : String(depot.lng),
  }
}

export function toDepotBody(values: DepotFormValues): DepotInput {
  const hasPoint = values.lat.trim() !== '' && values.lng.trim() !== ''
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    opensAt: values.opensAt.trim(),
    closesAt: values.closesAt.trim(),
    lat: hasPoint ? toNumber(values.lat) : null,
    lng: hasPoint ? toNumber(values.lng) : null,
  }
}
