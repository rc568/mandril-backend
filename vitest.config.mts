import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./tests/support/environment.ts'],
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/product/**/*.test.ts'],
          exclude: ['tests/product/**/*.integration.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/product/**/*.integration.test.ts'],
          globalSetup: ['./tests/support/database-setup.ts'],
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/modules/product/**/*.ts'],
      exclude: ['src/modules/product/**/index.ts', 'src/modules/product/domain/products.types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
