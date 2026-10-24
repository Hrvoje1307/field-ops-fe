import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { hr } from './hr'

export const defaultNS = 'translation'

// Inline resources make init synchronous, so t() works on first render.
void i18n.use(initReactI18next).init({
  lng: 'hr',
  fallbackLng: 'hr',
  defaultNS,
  resources: { hr: { [defaultNS]: hr } },
  interpolation: { escapeValue: false },
})

export { i18n }
