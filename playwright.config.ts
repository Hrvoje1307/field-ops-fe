import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // The dev server compiles on first use: the first screens of a cold run can take a while
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'hr-HR',
    timezoneId: 'Europe/Zagreb',
    // A failure keeps its trace, so a flake has its cause the first time it happens (no retries hide it)
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    env: { VITE_DEVTOOLS: 'false' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
