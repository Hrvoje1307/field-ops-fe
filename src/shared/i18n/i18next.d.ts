import 'i18next'

import type { defaultNS } from './index'
import type { hr } from './hr'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: { translation: typeof hr }
  }
}
