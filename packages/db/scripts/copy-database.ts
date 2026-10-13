/**
 * `pnpm db:copy "<from>" "<to>"` — every row of one database into another.
 *
 * For moving the product's data between Postgres hosts: a new region (decision
 * 0032), a new provider (decision 0028's "reversing it"). The target must be
 * migrated with `pnpm db:deploy` and empty; the source is only read.
 *
 * No superuser is needed, which is the point. A managed Postgres will not let
 * you switch triggers or foreign keys off, so rows go in parent first, in the
 * order their actual foreign-key values require. Two nullable columns close a
 * cycle between tables — `Storyboard.forkedFromVersionId` and
 * `Section.currentRevisionId` — so they are inserted empty and filled in at the
 * end. `Revision` is never updated afterwards: a trigger forbids it (NFR-3),
 * and its cycle with `Suggestion` is resolved row by row instead.
 *
 * It all happens in one transaction on the target, and it finishes by
 * comparing every table on both sides by checksum. It never prints a URL — but
 * pnpm echoes the command line it runs, credentials and all. With real ones,
 * pass them in the environment instead, which pnpm does not echo:
 *
 *   COPY_FROM="postgres://…" COPY_TO="postgres://…" pnpm db:copy
 *
 * Then run the restore drill on the target.
 */
import { loadRootEnv } from '@storyboard/config/env'
import { Client } from 'pg'

loadRootEnv()

type Row = Record<string, unknown>
type ForeignKey = { child: string; parent: string; cols: string[]; refcols: string[] }
type Column = { name: string; type: string }
type Node = { table: string; row: Row; deps: Set<number>; children: number[] }

/** Nullable columns that close a cycle between tables: inserted empty, set at the end. */
const DEFERRED: Record<string, string[]> = {
  Storyboard: ['forkedFromVersionId'],
  Section: ['currentRevisionId'],
}

/** The target's own migration history stays its own. */
const SKIP = new Set(['_prisma_migrations'])

/** Rows per INSERT. Small enough for any parameter limit, large enough to be quick. */
const BATCH = 200

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const hostOf = (url: string) => {
  try {
    const { hostname, port, pathname } = new URL(url)
    return `${hostname}${port ? `:${port}` : ''}${pathname}`
  } catch {
    return 'a URL that does not parse'
  }
}

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20_000 })
  await client.connect()
  // Checksums compare text renderings, and a timestamp renders in the session zone.
  await client.query("set time zone 'UTC'")
  return client
}

async function tableNames(db: Client): Promise<string[]> {
  const { rows } = await db.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  )
  return rows.map((r) => r.tablename).filter((t) => !SKIP.has(t))
}

async function migrations(db: Client): Promise<string[]> {
  const { rows: table } = await db.query<{ present: boolean }>(
    "select to_regclass('public._prisma_migrations') is not null as present",
  )
  if (!table[0]?.present) return []
  const { rows } = await db.query<{ migration_name: string }>(
    'select migration_name from "_prisma_migrations" where finished_at is not null order by 1',
  )
  return rows.map((r) => r.migration_name)
}

async function foreignKeys(db: Client): Promise<ForeignKey[]> {
  const { rows } = await db.query<ForeignKey>(`
    select trim(both '"' from c.conrelid::regclass::text) as child,
           trim(both '"' from c.confrelid::regclass::text) as parent,
           array(select attname::text from unnest(c.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by i) as cols,
           array(select attname::text from unnest(c.confkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by i) as refcols
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)
  return rows
}

async function columns(db: Client, table: string): Promise<Column[]> {
  const { rows } = await db.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  )
  return rows.map((r) => ({ name: r.column_name, type: r.data_type }))
}

async function checksum(db: Client, table: string): Promise<{ n: number; h: string }> {
  const { rows } = await db.query<{ n: number; h: string }>(
    `select count(*)::int as n,
            coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as h
     from ${quote(table)} t`,
  )
  const [result] = rows
  if (!result) throw new Error(`Could not read ${table}.`)
  return result
}

/** Every row after every row it points at (Kahn's algorithm over the actual values). */
function insertionOrder(names: string[], data: Map<string, Row[]>, fks: ForeignKey[]): Node[] {
  const nodes: Node[] = names.flatMap((table) =>
    (data.get(table) ?? []).map((row) => ({ table, row, deps: new Set<number>(), children: [] })),
  )

  const keyOf = (table: string, cols: string[], values: unknown[]) =>
    `${table}|${cols.join(',')}|${values.map(String).join(',')}`
  const referenced = new Map<string, string[][]>()
  for (const fk of fks) {
    const list = referenced.get(fk.parent) ?? []
    if (!list.some((cols) => cols.join(',') === fk.refcols.join(','))) list.push(fk.refcols)
    referenced.set(fk.parent, list)
  }
  const index = new Map<string, number>()
  nodes.forEach((node, i) => {
    for (const cols of referenced.get(node.table) ?? []) {
      index.set(
        keyOf(
          node.table,
          cols,
          cols.map((c) => node.row[c]),
        ),
        i,
      )
    }
  })

  nodes.forEach((node, i) => {
    for (const fk of fks.filter((f) => f.child === node.table)) {
      if (fk.cols.some((c) => DEFERRED[node.table]?.includes(c))) continue
      const values = fk.cols.map((c) => node.row[c])
      if (values.some((v) => v === null || v === undefined)) continue
      const parent = index.get(keyOf(fk.parent, fk.refcols, values))
      if (parent === undefined) {
        throw new Error(
          `${node.table}.${fk.cols.join(',')} points at a ${fk.parent} row that is not there.`,
        )
      }
      if (parent !== i && !node.deps.has(parent)) {
        node.deps.add(parent)
        nodes[parent]?.children.push(i)
      }
    }
  })

  const waiting = nodes.map((n) => n.deps.size)
  const ready = nodes.flatMap((_, i) => (waiting[i] === 0 ? [i] : []))
  const order: Node[] = []
  for (let next = ready.shift(); next !== undefined; next = ready.shift()) {
    const node = nodes[next]
    if (!node) continue
    order.push(node)
    for (const child of node.children) {
      waiting[child] = (waiting[child] ?? 0) - 1
      if (waiting[child] === 0) ready.push(child)
    }
  }
  if (order.length !== nodes.length) {
    throw new Error('Some rows form a cycle that no deferred column breaks. Nothing was copied.')
  }
  return order
}

async function copy(from: Client, to: Client, names: string[]): Promise<void> {
  const data = new Map<string, Row[]>()
  const shapes = new Map<string, Column[]>()
  for (const table of names) {
    shapes.set(table, await columns(from, table))
    data.set(table, (await from.query<Row>(`select * from ${quote(table)}`)).rows)
  }
  const total = [...data.values()].reduce((sum, rows) => sum + rows.length, 0)
  console.warn(`read ${String(total)} rows from ${String(names.length)} tables`)

  const fks = (await foreignKeys(from)).filter(
    (fk) => names.includes(fk.child) && names.includes(fk.parent),
  )
  const order = insertionOrder(names, data, fks)

  await to.query('begin')
  try {
    for (let start = 0; start < order.length;) {
      const table = order[start]?.table ?? ''
      let end = start
      while (end < order.length && order[end]?.table === table && end - start < BATCH) end += 1
      const cols = shapes.get(table) ?? []
      const deferred = DEFERRED[table] ?? []
      const params: unknown[] = []
      const tuples = order.slice(start, end).map(({ row }) => {
        const slots = cols.map(({ name, type }) => {
          let value = deferred.includes(name) ? null : row[name]
          // node-postgres would write a JS array as a Postgres array; a JSON
          // column holding an array has to go in as JSON text.
          if (value !== null && (type === 'json' || type === 'jsonb')) value = JSON.stringify(value)
          params.push(value)
          return `$${String(params.length)}`
        })
        return `(${slots.join(', ')})`
      })
      await to.query(
        `insert into ${quote(table)} (${cols.map((c) => quote(c.name)).join(', ')}) values ${tuples.join(', ')}`,
        params,
      )
      start = end
    }
    for (const [table, deferredColumns] of Object.entries(DEFERRED)) {
      for (const column of deferredColumns) {
        for (const row of data.get(table) ?? []) {
          if (row[column] === null || row[column] === undefined) continue
          await to.query(`update ${quote(table)} set ${quote(column)} = $1 where id = $2`, [
            row[column],
            row.id,
          ])
        }
      }
    }
    await to.query('commit')
  } catch (error) {
    await to.query('rollback').catch(() => undefined)
    throw error
  }
  console.warn(
    `inserted ${String(total)} rows, then filled ${Object.values(DEFERRED).flat().join(' and ')}`,
  )
}

async function main(): Promise<void> {
  const [fromArg, toArg] = process.argv.slice(2)
  const fromUrl = fromArg ?? process.env.COPY_FROM
  const toUrl = toArg ?? process.env.COPY_TO
  if (!fromUrl || !toUrl) {
    throw new Error(
      'Usage: COPY_FROM="<from>" COPY_TO="<to>" pnpm db:copy. The target must be migrated and empty.',
    )
  }
  if (fromUrl === toUrl) throw new Error('The source and the target are the same database.')

  console.warn(`Copying ${hostOf(fromUrl)} → ${hostOf(toUrl)}`)
  const from = await connect(fromUrl)
  const to = await connect(toUrl)
  try {
    const [source, target] = await Promise.all([migrations(from), migrations(to)])
    if (source.join() !== target.join()) {
      throw new Error(
        `The two databases are not on the same migrations (${String(source.length)} and ` +
          `${String(target.length)} applied). Run \`pnpm db:deploy\` on the one that is behind.`,
      )
    }

    const names = await tableNames(from)
    for (const table of names) {
      const { n } = await checksum(to, table)
      if (n > 0) throw new Error(`The target already has rows in ${table}. Nothing was copied.`)
    }

    await copy(from, to, names)

    console.warn('verifying, table by table:')
    let different = 0
    for (const table of names) {
      const [a, b] = await Promise.all([checksum(from, table), checksum(to, table)])
      const same = a.n === b.n && a.h === b.h
      if (!same) different += 1
      console.warn(`  ${same ? 'same' : 'DIFF'}  ${table.padEnd(26)} ${String(a.n).padStart(6)}`)
    }
    if (different) {
      process.exitCode = 1
      console.warn(`${String(different)} table(s) differ. Do not switch over.`)
      return
    }
    console.warn('Every table is identical. Now run: pnpm db:drill "<to>"')
  } finally {
    await Promise.all([from.end(), to.end()])
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
