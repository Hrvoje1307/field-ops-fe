function requireEnv(name: 'VITE_API_URL'): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local, or set it in the Vercel project settings.`,
    )
  }
  return value
}

export const env = {
  apiUrl: requireEnv('VITE_API_URL').replace(/\/$/, ''),
  apiMock: import.meta.env.VITE_API_MOCK === 'true',
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '',
} as const
