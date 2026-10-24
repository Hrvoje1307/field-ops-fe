import { i18n } from '@/shared/i18n'

/** The preview's own strings. Not in hr.ts, so builds without the mock API don't ship them. */
const hr = {
  title: 'Prilagođena polja',
  description:
    'Polja aktivne tvrtke iz /custom-fields, za uređivanje i prikaz. Ništa se ne šalje poslužitelju.',
  entity: 'Entitet',
  sample: 'Vrijednosti: {{name}}',
  noSample: 'Nema zapisa s vrijednostima, polja su prazna.',
  noFields: 'Za ovaj entitet nema prilagođenih polja.',
  loadFailed: 'Polja nije moguće učitati.',
  edit: 'Uređivanje',
  read: 'Prikaz',
  check: 'Provjeri',
  valid: 'Podaci su ispravni.',
  payload: 'Podaci za slanje',
} as const

export const PREVIEW_NS = 'devCustomFields'

declare module 'i18next' {
  interface SliceResources {
    devCustomFields: typeof hr
  }
}

i18n.addResourceBundle('hr', PREVIEW_NS, hr)
