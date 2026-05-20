import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    /** Existing `.test.ts` files under imports use `node:test`; keep Vitest scoped. */
    include: [
      'src/lib/time/**/*.test.ts',
      'src/features/calendar/**/*.test.ts',
    ],
  },
});
