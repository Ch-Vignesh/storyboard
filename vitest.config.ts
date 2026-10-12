import { defineConfig } from 'vitest/config'

// Root-level tests cover repository tooling only: scripts/, and packages/config,
// which is plain JavaScript with no runner of its own.
// Application and package tests run inside their own workspace via `turbo run test`.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'packages/config/**/*.test.js'],
    environment: 'node',
  },
})
