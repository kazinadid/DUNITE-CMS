import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    /** Existing `.test.ts` files under imports use `node:test`; vitest loads only tz helpers here. */
    include: ['src/lib/time/**/*.test.ts'],
  },
});
