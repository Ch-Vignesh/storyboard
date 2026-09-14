import { defineConfig, globalIgnores } from 'eslint/config'
import base from '@storyboard/config/eslint/base'

// Lints repository tooling only. Every app and package carries its own config.
export default defineConfig([
  globalIgnores(['apps/**', 'packages/**', 'docs/**', 'node_modules/**']),
  ...base,
])
