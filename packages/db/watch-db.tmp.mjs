// Waits for the production database to answer through the pooled host the app
// uses. Read-only: one `select 1` per attempt. Exits 0 on three successes in a
// row, 1 after the time limit. Run from packages/db so `pg` resolves.
import { loadRootEnv } from '@storyboard/config/env'
import pg from 'pg'

loadRootEnv()
const url = process.env.DATABASE_URL
const EVERY_MS = 120_000
const LIMIT_MS = 100 * 60_000
const started = Date.now()
let inARow = 0

async function once() {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 })
  try {
    await client.connect()
    await client.query('select 1')
    return null
  } catch (error) {
    return String(error.message).slice(0, 90)
  } finally {
    await client.end().catch(() => {})
  }
}

while (Date.now() - started < LIMIT_MS) {
  const failure = await once()
  const at = new Date().toISOString().slice(11, 19)
  if (failure) {
    inARow = 0
    console.log(`${at} UTC  still failing: ${failure}`)
  } else {
    inARow += 1
    console.log(`${at} UTC  ok (${String(inARow)} in a row)`)
    if (inARow >= 3) {
      console.log('DATABASE BACK')
      process.exit(0)
    }
  }
  await new Promise((resolve) => setTimeout(resolve, inARow > 0 ? 20_000 : EVERY_MS))
}
console.log('GAVE UP after 100 minutes')
process.exit(1)
