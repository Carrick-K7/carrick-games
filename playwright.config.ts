import { defineConfig, devices } from '@playwright/test';

// The preview port is overridable so two checkouts on one machine can run their
// suites side by side. The server is never reused: a foreign listener on this
// port must fail the run loudly instead of silently serving another checkout.
const port = Number(process.env.CG_PREVIEW_PORT ?? 8080);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('CG_PREVIEW_PORT must be a valid TCP port');

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.ts', 'games/*/tests/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One worker: the 3D cases rasterise through software GL, so sharding them
  // across CPUs makes every case slower and pushes them past their timeouts.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // --strictPort keeps a busy port a startup failure rather than a silent move
    // to a port the tests are not pointed at.
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
  },
});
