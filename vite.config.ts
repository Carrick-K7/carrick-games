import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { gameCatalogPlugin } from './scripts/vite-catalog.mjs';

const root = import.meta.dirname;
export default defineConfig({
  root: resolve(root, 'apps/shell'),
  publicDir: resolve(root, 'apps/shell/public'),
  plugins: [gameCatalogPlugin()],
  server: { fs: { allow: [root] } },
  build: { outDir: resolve(root, 'dist'), manifest: true, sourcemap: false },
  test: {
    root,
    include: ['tests/unit/**/*.test.ts', 'apps/shell/**/*.test.ts', 'games/*/**/*.test.ts', 'packages/*/**/*.test.ts'],
  },
});
