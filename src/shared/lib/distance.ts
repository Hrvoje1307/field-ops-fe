/** Metres as a short distance in the locale: `850 m`, `12,3 km` (hr-HR). */
export function formatDistance(metres: number, locale: string): string {
  const rounded = Math.max(0, Math.round(metres))
  if (rounded < 1000) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(rounded)
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(rounded / 1000)
}
