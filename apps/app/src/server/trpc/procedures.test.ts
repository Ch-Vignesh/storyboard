import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A structural rule, checked by reading the routers rather than by calling them.
 *
 * FR-13.5 with decision 0018: a suspended account writes nothing. `can()`
 * enforces that for anything that loads a storyboard — but a mutation that does
 * not load one never reaches `can()`, and there are plenty: creating a
 * storyboard, editing a profile, committing an import. Nineteen of them were
 * reachable by a suspended account with a live session before this test existed.
 *
 * So the rule is the procedure builder, and this is what keeps it true: every
 * mutation is `activeProcedure` (which refuses a suspended account) or
 * `adminProcedure` (which refuses everyone but an administrator). A test that
 * reads source is a blunt instrument, and it is the right one here — the thing
 * being protected is a convention, and a convention with no check is a comment.
 */
const DIR = join(import.meta.dirname, 'routers')

type Procedure = { file: string; name: string; builder: string; kind: 'query' | 'mutation' }

function procedures(): Procedure[] {
  const found: Procedure[] = []

  for (const file of readdirSync(DIR)) {
    if (!file.endsWith('.ts') || file === '_app.ts') continue
    const lines = readFileSync(join(DIR, file), 'utf8').split('\n')

    for (const [index, line] of lines.entries()) {
      const match = /^ {2}(\w+): (\w+Procedure)/u.exec(line)
      if (!match) continue

      let end = lines.length
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const next = lines[cursor] ?? ''
        if (/^ {2}\w+: \w+Procedure/u.test(next) || next.startsWith('})')) {
          end = cursor
          break
        }
      }

      const body = lines.slice(index, end).join('\n')
      const [, name, builder] = match
      if (!name || !builder) continue
      found.push({
        file,
        name,
        builder,
        kind: body.includes('.mutation(') ? 'mutation' : 'query',
      })
    }
  }

  return found
}

describe('how procedures are built', () => {
  const all = procedures()

  it('finds the routers at all', () => {
    expect(all.length).toBeGreaterThan(50)
  })

  /** The three a person reaches before they have an account at all (FR-1.4). */
  const BEFORE_YOU_HAVE_A_SESSION = new Set(['signUp', 'resendVerification', 'setPassword'])

  it('never lets a suspended account reach a mutation (FR-13.5, decision 0018)', () => {
    const wrong = all
      .filter((procedure) => procedure.kind === 'mutation')
      .filter((procedure) => !BEFORE_YOU_HAVE_A_SESSION.has(procedure.name))
      .filter(
        (procedure) =>
          procedure.builder !== 'activeProcedure' && procedure.builder !== 'adminProcedure',
      )
      .map((procedure) => `${procedure.file}: ${procedure.name} is ${procedure.builder}`)

    expect(wrong).toEqual([])
  })

  it('has no mutation a signed-out person can reach, except the ones sign-up needs', () => {
    // Signing up and setting a password are how somebody gets a session in the
    // first place; everything else needs one. FR-1.4.
    const allowed = BEFORE_YOU_HAVE_A_SESSION

    const wrong = all
      .filter(
        (procedure) => procedure.kind === 'mutation' && procedure.builder === 'publicProcedure',
      )
      .filter((procedure) => !allowed.has(procedure.name))
      .map((procedure) => `${procedure.file}: ${procedure.name}`)

    expect(wrong).toEqual([])
  })

  it('keeps reading open to a suspended account, which is the other half of 0018', () => {
    // If queries had been swept into `activeProcedure` too, a suspended person
    // could not read their own storyboard — and decision 0018 is explicit that
    // the freeze is on writing.
    const queries = all.filter((procedure) => procedure.kind === 'query')
    expect(queries.some((procedure) => procedure.builder === 'publicProcedure')).toBe(true)
    expect(queries.filter((procedure) => procedure.builder === 'activeProcedure')).toHaveLength(1)
  })
})
