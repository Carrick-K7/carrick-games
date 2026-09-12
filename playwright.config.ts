import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Every spec owns its own page and the preview server is static, so CI can
  // shard across files instead of running all 211 browser cases one at a time.
  // Kept at 1 locally so the software renderer is not competing with itself.
  workers: process.env.CI ? 4 : 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 8080',
    port: 8080,
    reuseExistingServer: true,
  },
});
