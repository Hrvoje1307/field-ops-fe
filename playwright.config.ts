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
    // PW_TRACE=1 keeps the trace of every failure (to find the cause of a flake). It is not on by
    // default: recording slows every test down, and the drag helpers of the boards are timing-sensitive
    trace: process.env.PW_TRACE ? 'retain-on-failure' : 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    env: { VITE_DEVTOOLS: 'false' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
