function requireEnv(name: 'VITE_API_URL'): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local, or set it in the Vercel project settings.`,
    )
  }
  return value
}

const apiUrl = requireEnv('VITE_API_URL').replace(/\/$/, '')

export const env = {
  apiUrl,
  /**
   * The SignalR hub. The contract names the path (`/hubs/dispatch`), not the host: it is
   * taken to be at the API's origin, outside `/api/v1`. `VITE_HUB_URL` overrides.
   */
  hubUrl: (import.meta.env.VITE_HUB_URL ?? `${new URL(apiUrl).origin}/hubs/dispatch`).replace(
    /\/$/,
    '',
  ),
  apiMock: import.meta.env.VITE_API_MOCK === 'true',
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '',
} as const
