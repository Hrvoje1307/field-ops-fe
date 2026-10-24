import type { Location } from '@/shared/api/generated/model'

/**
 * The API's single-line address ("street, city"). `address` is optional in the spec;
 * until it is required (docs/backend-questions.md #25) street and city are joined here,
 * and only here.
 */
export function locationAddress(location: Pick<Location, 'address' | 'street' | 'city'>): string {
  return location.address ?? `${location.street}, ${location.city}`
}
