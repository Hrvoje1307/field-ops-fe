import { describe, expect, it } from 'vitest'

/** Source of the app: not tests, not the mock itself, not helpers of the tests. */
const sources = import.meta.glob<string>(
  [
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
    '!/src/**/test/**',
    '!/src/shared/api/mocks/**',
    '!/src/shared/api/generated/**',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/** The only places that may reach for the mock: they start it when `VITE_API_MOCK` asks. */
const ALLOWED = new Set([
  '/src/app/providers/mocks.ts',
  '/src/app/mock-routes.ts',
  // Lazy, only bundled with the mock (the demo sign-in buttons list its accounts)
  '/src/features/auth/sign-in/ui/demo-logins.tsx',
])

describe('the app does not know the mock', () => {
  it('reads the source of the app', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
  })

  it('nothing outside the mock imports it, except the files that start it', () => {
    const importers = Object.entries(sources)
      .filter(
        ([file, text]) => /from ['"][^'"]*shared\/api\/mocks/.test(text) && !ALLOWED.has(file),
      )
      .map(([file]) => file)
    expect(importers).toEqual([])
  })

  it('the mock-only triggers appear nowhere in the app', () => {
    const offenders = Object.entries(sources)
      .filter(
        ([file, text]) => /MOCK_AI_|mock-oauth|fieldopsResetMock/.test(text) && !ALLOWED.has(file),
      )
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
