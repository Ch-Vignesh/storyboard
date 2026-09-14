import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import globals from 'globals'
import base from './base.js'

/** Rules for a Next.js app: everything in `base` plus React, hooks and Core Web Vitals. */
export default defineConfig([
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts']),
  nextVitals,
  base,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2024 },
    },
  },
])
