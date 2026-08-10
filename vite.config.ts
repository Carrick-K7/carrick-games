import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    manifest: true,
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
