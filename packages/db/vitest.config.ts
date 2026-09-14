import { loadRootEnv } from '@storyboard/config/env'
import { defineConfig } from 'vitest/config'

loadRootEnv()

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Integration tests share one database; keep them sequential.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
