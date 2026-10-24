interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_MOCK?: string
  readonly VITE_GOOGLE_MAPS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
