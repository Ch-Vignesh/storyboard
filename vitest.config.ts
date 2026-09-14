import { defineConfig } from 'vitest/config'

// Root-level tests cover repository tooling only (scripts/).
// Application and package tests run inside their own workspace via `turbo run test`.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
})
