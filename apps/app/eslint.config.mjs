import { defineConfig } from 'eslint/config'
import next from '@storyboard/config/eslint/next'

export default defineConfig([
  next,
  { settings: { next: { rootDir: import.meta.dirname } } },
  {
    // Phase 10: links prefetch on intent, not on sight. src/components/link.tsx says why.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/link.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message:
                "Import Link from '@/components/link': it prefetches on intent rather than on sight.",
            },
          ],
        },
      ],
    },
  },
])
