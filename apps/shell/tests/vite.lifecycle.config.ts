import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
// Source-only, synthetic-catalog browser iteration. No build store or real game
// implementation is served by the fixtures; formal CI uses the root config.
export default defineConfig({
  root: resolve(root, 'apps/shell'),
  publicDir: resolve(root, 'apps/shell/public'),
  server: { fs: { allow: [root] } },
  resolve: { alias: { '@carrick/lifecycle': resolve(root, 'packages/lifecycle/src/index.ts') } },
});
