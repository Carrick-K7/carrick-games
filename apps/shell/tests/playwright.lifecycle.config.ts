import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const port = Number(process.env.CG_LIFECYCLE_PORT ?? 4187);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Invalid lifecycle fixture port');
export default defineConfig({
  testDir: resolve(root, 'tests'),
  testMatch: 'shell-awaitable-lifecycle.spec.ts',
  outputDir: resolve(root, 'test-results/lifecycle'),
  fullyParallel: false, workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config apps/shell/tests/vite.lifecycle.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: root, port, reuseExistingServer: false,
  },
});
