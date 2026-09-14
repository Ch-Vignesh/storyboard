import { defineConfig, globalIgnores } from 'eslint/config'
import base from '@storyboard/config/eslint/base'

export default defineConfig([globalIgnores(['src/generated/**']), base])
