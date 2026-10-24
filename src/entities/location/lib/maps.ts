/** Anything with an address and maybe coordinates: `Location`, `JobSummary.location`. */
export interface MapPlace {
  address: string
  lat?: number | null
  lng?: number | null
}

/**
 * Google Maps link (no API key needed): by coordinates when known, else by address.
 * `directions` opens navigation to the place (the app on phones).
 */
export function mapsUrl(place: MapPlace, { directions = false } = {}): string {
  const target =
    place.lat != null && place.lng != null
      ? `${String(place.lat)},${String(place.lng)}`
      : place.address
  const url = new URL(
    directions ? 'https://www.google.com/maps/dir/' : 'https://www.google.com/maps/search/',
  )
  url.searchParams.set('api', '1')
  url.searchParams.set(directions ? 'destination' : 'query', target)
  return url.toString()
}
