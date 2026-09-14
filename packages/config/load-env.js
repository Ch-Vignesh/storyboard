// Side-effect module: `import '@storyboard/config/load-env'` as the FIRST import
// of a config file guarantees the root .env is loaded before any later import
// reads process.env. (ES imports are hoisted, so calling loadRootEnv() in the
// body of the file would run too late.)
import { loadRootEnv } from './env.js'

loadRootEnv()
