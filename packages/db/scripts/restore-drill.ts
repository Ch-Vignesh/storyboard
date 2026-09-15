/**
 * The restore drill (NFR-8).
 *
 * NFR-8 asks for daily backups with a 30-day recovery window. Turning backups
 * on satisfies the sentence and not the requirement: what the requirement is
 * actually for is the afternoon somebody has to use one, and a backup nobody
 * has restored is a hope rather than a plan. This script is the difference. It
 * is the drill, run against a database restored from a backup, and it either
 * passes or names the thing that is wrong with the copy.
 *
 * It checks four things, in the order that they would ruin your day:
 *
 * 1. **Every migration applied, none pending.** A restore from before a
 *    migration is a database the application will not start against.
 * 2. **The invariants exist.** The immutability trigger and the partial unique
 *    indexes are not in the Prisma schema — they are hand-written SQL inside
 *    migrations. A restore that lost them looks fine and accepts writes the
 *    product's whole model forbids. This is the check worth having.
 * 3. **The tables hold rows.** An empty database passes every structural check
 *    ever written.
 * 4. **A storyboard reads out whole**, chapters and sections and the revision
 *    each section points at. Referential integrity is easy to claim and easy to
 *    lose across a restore.
 *
 *   pnpm db:drill "postgresql://…restored…"
 *
 * Point it at the restored copy, never at production — it refuses a URL that is
 * also `DATABASE_URL`.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadRootEnv } from '@storyboard/config/env'
import { Client } from 'pg'

loadRootEnv()

/** Named in `20260912000100_invariants`, and the reason `prisma db push` is banned. */
const REQUIRED_TRIGGERS = ['revision_no_update', 'revision_no_delete']
const REQUIRED_INDEXES = [
  'one_main_per_storyboard',
  'one_open_request_per_section',
  'one_helpful_idea_per_request',
]

/** Tables that being empty in would mean the restore did not bring the data. */
const MUST_HAVE_ROWS = ['User', 'Storyboard', 'Chapter', 'Section', 'Revision']

/** Prisma's own CLI entry point, so it can be run under this Node directly. */
function prismaCli(): string {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('prisma/package.json')
  const manifest = require('prisma/package.json') as { bin?: string | Record<string, string> }
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma
  if (!bin) throw new Error('Cannot find the Prisma CLI entry point in its package.json.')
  return resolvePath(dirname(manifestPath), bin)
}

type Check = { name: string; ok: boolean; detail: string }

const results: Check[] = []
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  console.warn(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * Two database URLs are "the same database" when host, port and name agree.
 * Credentials and query parameters differ between a pooled and a direct string
 * for what is unarguably one database, so comparing the whole URL would let
 * production through on a technicality.
 */
function sameDatabase(a: string, b: string): boolean {
  try {
    const [x, y] = [new URL(a), new URL(b)]
    return x.host === y.host && x.pathname === y.pathname
  } catch {
    return a === b
  }
}

async function main(): Promise<void> {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: pnpm db:drill "postgresql://…restored…"\n')
    console.error('Point it at a database restored from a backup. See docs/05-deployment.md.')
    process.exitCode = 1
    return
  }

  for (const [name, value] of [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['DIRECT_DATABASE_URL', process.env.DIRECT_DATABASE_URL],
  ] as const) {
    if (value && sameDatabase(url, value)) {
      console.error(
        `Refusing to run: that is ${name}. The drill is for a restored copy — it reads\n` +
          'a live database as if it were disposable, and one day somebody will edit it to\n' +
          'do more than read.',
      )
      process.exitCode = 1
      return
    }
  }

  console.warn(`Drilling ${new URL(url).host}${new URL(url).pathname}\n`)

  // 1. Migrations. Prisma's own status command is the authority here; anything
  //    this script reimplemented would drift from it.
  const packageRoot = fileURLToPath(new URL('..', import.meta.url))
  try {
    // Run the CLI's entry point under this Node rather than going through a
    // launcher. `npx` on Windows is a .cmd, which Node 24 refuses to spawn
    // without a shell, and a shell is how a connection string ends up being
    // interpreted by cmd.exe.
    const output = execFileSync(process.execPath, [prismaCli(), 'migrate', 'status'], {
      cwd: packageRoot,
      // The CLI reads DIRECT_DATABASE_URL first (see prisma.config.ts), so the
      // drill's URL has to win over whatever the root .env holds.
      env: { ...process.env, DIRECT_DATABASE_URL: url, DATABASE_URL: url },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const applied = /(\d+) migrations? found/u.exec(output)?.[1] ?? '?'
    record('every migration applied', true, `${applied} found, none pending`)
  } catch (error) {
    const output = String((error as { stdout?: string }).stdout ?? error)
    const pending = output.includes('have not yet been applied')
    record(
      'every migration applied',
      false,
      pending
        ? 'migrations are pending — this backup predates the current schema'
        : output.split('\n').slice(0, 4).join(' ').trim(),
    )
  }

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    // 2. The invariants. These are the ones a schema comparison would not miss
    //    but a hand-rebuilt database would.
    const triggers = await client.query<{ tgname: string }>(
      'select tgname from pg_trigger where not tgisinternal',
    )
    const haveTriggers = new Set(triggers.rows.map((row) => row.tgname))
    const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !haveTriggers.has(name))
    record(
      'revision immutability trigger (NFR-3)',
      missingTriggers.length === 0,
      missingTriggers.length
        ? `missing: ${missingTriggers.join(', ')}`
        : REQUIRED_TRIGGERS.join(', '),
    )

    const indexes = await client.query<{ indexname: string }>(
      'select indexname from pg_indexes where schemaname = current_schema()',
    )
    const haveIndexes = new Set(indexes.rows.map((row) => row.indexname))
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !haveIndexes.has(name))
    record(
      'partial unique indexes',
      missingIndexes.length === 0,
      missingIndexes.length ? `missing: ${missingIndexes.join(', ')}` : REQUIRED_INDEXES.join(', '),
    )

    // 3. Rows, because an empty database passes everything above.
    const counts: string[] = []
    const empty: string[] = []
    for (const table of MUST_HAVE_ROWS) {
      const result = await client.query<{ count: string }>(
        `select count(*)::text as count from "${table}"`,
      )
      const count = Number(result.rows[0]?.count ?? '0')
      counts.push(`${table} ${String(count)}`)
      if (count === 0) empty.push(table)
    }
    record(
      'the tables hold data',
      empty.length === 0,
      empty.length ? `empty: ${empty.join(', ')}` : counts.join(', '),
    )

    // 4. One storyboard, read out whole. Structure and counts can both be right
    //    while the thing the product exists to show is unreadable.
    const readable = await client.query<{
      title: string
      chapters: string
      sections: string
      revisions: string
    }>(`
      select s.title,
             count(distinct c.id)::text as chapters,
             count(distinct sec.id)::text as sections,
             count(distinct sec."currentRevisionId")::text as revisions
        from "Storyboard" s
        join "Version" v on v."storyboardId" = s.id
        join "Chapter" c on c."versionId" = v.id
        join "Section" sec on sec."chapterId" = c.id
       where sec."currentRevisionId" is not null
       group by s.id, s.title
       order by count(sec.id) desc
       limit 1
    `)

    const row = readable.rows[0]
    record(
      'a storyboard reads out whole',
      Boolean(row),
      row
        ? `“${row.title}” — ${row.chapters} chapters, ${row.sections} sections, ${row.revisions} current revisions`
        : 'no storyboard has a readable section: the revision chain did not survive',
    )
  } finally {
    await client.end()
  }

  const failed = results.filter((check) => !check.ok)
  console.warn('')
  if (failed.length) {
    console.warn(`${String(failed.length)} of ${String(results.length)} checks failed.`)
    console.warn('This backup is not one you could launch from. Do not record the drill as passed.')
    process.exitCode = 1
    return
  }
  console.warn(`All ${String(results.length)} checks passed on ${new Date().toISOString()}.`)
  console.warn('Record the date in docs/04-phase-plan.md — an undated drill did not happen.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
