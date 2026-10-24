import 'i18next'

import type { defaultNS } from './index'
import type { hr } from './hr'

declare module 'i18next' {
  /**
   * Namespaces that a slice registers itself with `i18n.addResourceBundle`, so its strings
   * ship only with that slice (e.g. mock-only developer previews). The slice adds its
   * namespace here by declaration merging.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging
  interface SliceResources {}

  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: { translation: typeof hr } & SliceResources
  }
}
