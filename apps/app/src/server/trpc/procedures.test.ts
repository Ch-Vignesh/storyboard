import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ADMIN_CAPABILITIES } from '@/lib/authz/admin'

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
 * `adminProcedure(capability)` (which refuses everyone but an administrator
 * holding that capability, decision 0043). A test that
 * reads source is a blunt instrument, and it is the right one here — the thing
 * being protected is a convention, and a convention with no check is a comment.
 */
const DIR = join(import.meta.dirname, 'routers')

type Procedure = {
  file: string
  name: string
  builder: string
  /** What `adminProcedure('…')` was given; null for the other builders. */
  capability: string | null
  kind: 'query' | 'mutation'
}

function procedures(): Procedure[] {
  const found: Procedure[] = []

  for (const file of readdirSync(DIR)) {
    if (!file.endsWith('.ts') || file === '_app.ts') continue
    const lines = readFileSync(join(DIR, file), 'utf8').split('\n')

    for (const [index, line] of lines.entries()) {
      const match = /^ {2}(\w+): (\w+Procedure)(?:\('([\w.]+)'\))?/u.exec(line)
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
      const [, name, builder, capability] = match
      if (!name || !builder) continue
      found.push({
        file,
        name,
        builder,
        capability: capability ?? null,
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

  /**
   * What a person reaches with no session: getting one in the first place
   * (FR-1.4), and getting back in after a forgotten password (FR-1.7). A
   * suspended account can reset its password too, and that is harmless: signing
   * in still refuses it, which is where FR-13.5 is enforced.
   */
  const BEFORE_YOU_HAVE_A_SESSION = new Set([
    'signUp',
    'resendVerification',
    'setPassword',
    'requestPasswordReset',
    'resetPassword',
    // Item 3.2: a new address is confirmed from its own mailbox, signed in or
    // not; the link is the authority, as a reset link is.
    'confirmEmailChange',
  ])

  /**
   * The one mutation that must be reachable by an account this rule freezes.
   *
   * `activeProcedure` refuses an account inside its deletion grace period
   * (decision 0024), which is the correct answer for all fifty-odd other
   * mutations and exactly the wrong one for the undo. Naming it here rather
   * than loosening the rule keeps the exception visible and countable.
   */
  const MUST_WORK_WHILE_FROZEN = new Set(['cancelDeletion'])

  it('has exactly one deliberate exception, and it is the one named here', () => {
    // If somebody adds a second, this fails and they have to come and argue
    // for it in this file rather than in a router nobody re-reads.
    expect([...MUST_WORK_WHILE_FROZEN]).toEqual(['cancelDeletion'])
    expect(all.some((procedure) => procedure.name === 'cancelDeletion')).toBe(true)
  })

  /**
   * `accountProcedure` refuses a suspended account but not one without a
   * username, so it is for the things somebody must do before they have one,
   * and nothing else: everything that writes is credited to that name.
   */
  const BEFORE_YOU_HAVE_A_USERNAME = new Set(['chooseUsername', 'requestDeletion'])

  it('never lets a suspended account reach a mutation (FR-13.5, decision 0018)', () => {
    const wrong = all
      .filter((procedure) => procedure.kind === 'mutation')
      .filter((procedure) => !BEFORE_YOU_HAVE_A_SESSION.has(procedure.name))
      .filter((procedure) => !MUST_WORK_WHILE_FROZEN.has(procedure.name))
      .filter(
        (procedure) =>
          procedure.builder !== 'activeProcedure' &&
          procedure.builder !== 'adminProcedure' &&
          !(
            procedure.builder === 'accountProcedure' &&
            BEFORE_YOU_HAVE_A_USERNAME.has(procedure.name)
          ),
      )
      .map((procedure) => `${procedure.file}: ${procedure.name} is ${procedure.builder}`)

    expect(wrong).toEqual([])
  })

  it('uses accountProcedure only where there may be no username yet (phase 12 audit)', () => {
    const lenient = all.filter((procedure) => procedure.builder === 'accountProcedure')
    expect(lenient.map((procedure) => procedure.name).sort()).toEqual(
      [...BEFORE_YOU_HAVE_A_USERNAME].sort(),
    )
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

  /**
   * Decision 0043 (phase 14, item 2b.2): every admin procedure names the
   * capability it needs, from the fixed list, so a sub-admin can hold some
   * doors and not others. The parameter's type refuses a name outside the
   * list already; this keeps that true if the type is ever widened, and keeps
   * the inventory readable in one place.
   */
  it('names a known capability on every admin procedure', () => {
    const admin = all.filter((procedure) => procedure.builder === 'adminProcedure')
    expect(admin.length).toBeGreaterThan(0)
    const known = new Set<string>(ADMIN_CAPABILITIES)
    const wrong = admin
      .filter((procedure) => !procedure.capability || !known.has(procedure.capability))
      .map(
        (procedure) => `${procedure.file}: ${procedure.name} (${procedure.capability ?? 'none'})`,
      )
    expect(wrong).toEqual([])
  })
})
