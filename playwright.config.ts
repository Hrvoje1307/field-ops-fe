import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'hr-HR',
    timezoneId: 'Europe/Zagreb',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    env: { VITE_DEVTOOLS: 'false' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
