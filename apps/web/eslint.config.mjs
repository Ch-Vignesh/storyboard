import { defineConfig } from 'eslint/config'
import next from '@storyboard/config/eslint/next'

export default defineConfig([next, { settings: { next: { rootDir: import.meta.dirname } } }])
