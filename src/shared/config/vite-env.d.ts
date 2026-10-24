interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_MOCK?: string
  readonly VITE_GOOGLE_MAPS_KEY?: string
  /** "false" hides the router and query devtools in dev (Playwright sets it). */
  readonly VITE_DEVTOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
