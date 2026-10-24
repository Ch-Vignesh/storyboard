import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it, vi } from 'vitest'

import {
  checkCode,
  checkFile,
  checkServerCode,
  checkServerFile,
  checkText,
  checkTrpcErrors,
  collectFiles,
  isIdentifierLike,
  run,
  SERVER_COPY_ROOTS,
  TRPC_ERROR_ROOTS,
} from './check-vocabulary'

const terms = (findings: ReturnType<typeof checkCode>) => findings.map((finding) => finding.term)

describe('check-vocabulary', () => {
  it('catches "merge" in JSX text (phase 0 exit criterion)', () => {
    const source = 'export const A = () => <button>Merge into main draft</button>'
    const findings = checkCode(source, 'a.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      term: 'merge',
      text: 'Merge',
      line: 1,
      column: source.indexOf('Merge') + 1,
    })
  })

  it('reports the right line for multi-line JSX text', () => {
    const source = [
      'export const A = () => (',
      '  <p>',
      '    Please merge this',
      '  </p>',
      ')',
    ].join('\n')
    const findings = checkCode(source, 'a.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ line: 3, column: 12 })
  })

  it('catches banned terms in string and template literals', () => {
    const source = "const a = 'Open a pull request'\nconst b = `You have ${n} branches and a diff`"
    expect(terms(checkCode(source, 'b.ts'))).toEqual(['pull request', 'branch', 'diff'])
  })

  it('ignores identifiers, comments, imports, directives, keys and type literals', () => {
    const source = [
      "'use client'",
      "import { diffWords } from 'diff'",
      "const words = await import('diff')",
      '// merge the two later',
      'const mergeSections = () => 1',
      "type Kind = 'merge' | 'accept'",
      "const map = { merge: 1, 'pull request': 2 }",
      "const x = map['merge']",
      'enum E { Merge = "merge" }',
    ].join('\n')
    expect(checkCode(source, 'c.ts')).toEqual([])
  })

  it('ignores a case label, which compares a key, and checks what the case returns', () => {
    const source =
      "function f(k: string) {\n  switch (k) {\n    case 'storyboards':\n      return 'Storyboards'\n  }\n}"
    const findings = checkCode(source, 'h.ts')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ term: 'storyboard', text: 'Storyboards', line: 4 })
  })

  it('catches the old product name and noun, which are Draftboard and story since phase 12', () => {
    const source = "const t = 'Start a storyboard'\nconst u = <p>Back to Storyboard</p>"
    expect(terms(checkCode(source, 'i.tsx'))).toEqual(['storyboard', 'storyboard'])
    expect(
      checkCode("import { db } from '@storyboard/db'\nconst s = storyboard.title", 'j.ts'),
    ).toEqual([])
  })

  it('skips plumbing JSX attributes but checks copy attributes', () => {
    const source = 'const A = () => <a href="/merge" className="fork-x" title="Merge now">go</a>'
    const findings = checkCode(source, 'd.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ term: 'merge', text: 'Merge' })
  })

  it('skips class-name helpers', () => {
    expect(checkCode("const c = cn('merge-tone', 'a', { 'fork-b': true })", 'e.ts')).toEqual([])
    expect(checkCode("const v = cva(['diff-x', `branch-${y}`])", 'f.ts')).toEqual([])
  })

  it('honours vocabulary-ok on the same line or on a comment line above', () => {
    const source = [
      '// vocabulary-ok: the export legally must name the algorithm',
      "const a = 'SHA-256 of the content'",
      "const b = 'Merged' // vocabulary-ok",
      "const c = 'Merged'",
    ].join('\n')
    const findings = checkCode(source, 'g.ts')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ line: 4 })
  })

  it('scans prose files line by line', () => {
    const findings = checkText('# Help\n\nClick **Merge** to fork it.\n', 'h.md')
    expect(terms(findings)).toEqual(['merge', 'fork'])
    expect(findings[0]).toMatchObject({ line: 3 })
  })

  describe('on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vocabulary-'))
    afterAll(() => rmSync(dir, { recursive: true, force: true }))

    it('finds a banned word in a fixture and skips ignored directories', () => {
      writeFileSync(join(dir, 'page.tsx'), 'export default () => <p>Merge it</p>\n')
      writeFileSync(join(dir, 'notes.txt'), 'nothing here\n')
      writeFileSync(join(dir, 'ok.ts'), "export const x = 'fine'\n")
      mkdirSync(join(dir, 'api'))
      writeFileSync(join(dir, 'api', 'route.ts'), "export const reason = 'merge failed'\n")

      const files = collectFiles([dir])
      expect(files.map((file) => basename(file))).toEqual(['notes.txt', 'ok.ts', 'page.tsx'])

      const findings = files.flatMap(checkFile)
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({ term: 'merge', line: 1 })
    })
  })

  /**
   * Phase 14, item 10.4 — words written on the server and read by people: the
   * emails, notifications, permission names, export front matter, import's
   * reasons, and the message of every `TRPCError`. Item 1.13 slipped through
   * because none of it was read.
   */
  describe('server copy', () => {
    it('reads every string, wherever it sits', () => {
      const source = [
        'export const subject = (title: string) => `Your storyboard ${title} was merged`',
        "export const labels = { open: 'Open a pull request' }",
        "sendMail({ to, text: 'Somebody forked it' })",
      ].join('\n')
      expect(terms(checkServerCode(source, 'mail.ts'))).toEqual([
        'storyboard',
        'merge',
        'pull request',
        'fork',
      ])
    })

    it('leaves identifiers alone: no spaces, and a colon, a dot, or only capitals', () => {
      const source = [
        "can(actor, 'storyboard:delete', resource)",
        "log.warn({ event: 'purge.storyboard' }, 'gone')",
        "const source = 'https://github.com/someone/storyboard'",
        "if (job.state === 'COMMITTED') return",
        "import { db } from '@storyboard/db'",
        "type Action = 'storyboard:read' | 'merge'",
      ].join('\n')
      expect(checkServerCode(source, 'router.ts')).toEqual([])
      for (const id of ['storyboard:delete', 'purge.storyboard', 'COMMITTED', 'BAD_REQUEST']) {
        expect(isIdentifierLike(id), id).toBe(true)
      }
      // A word is still a word, and a sentence with a full stop is still a sentence.
      for (const words of ['Merged', 'Merge it.', 'storyboard']) {
        expect(isIdentifierLike(words), words).toBe(false)
      }
    })

    it('still catches a one-word string, and honours vocabulary-ok', () => {
      const source = [
        "const a = 'Merged'",
        "const b = 'Your storyboard is ready.'",
        '// vocabulary-ok: the proof names its algorithm',
        "const c = 'SHA-256 OF THE TEXT'",
      ].join('\n')
      expect(terms(checkServerCode(source, 'x.ts'))).toEqual(['merge', 'storyboard'])
    })

    it('reads the message of a TRPCError, however it is written, and nothing else', () => {
      const source = [
        "log.info({ event: 'x' }, 'merge logged')",
        "throw new Error('the merge failed')",
        "throw new TRPCError({ code: 'CONFLICT', message: 'Someone merged it first.' })",
        "throw new TRPCError({ code: 'NOT_FOUND', message: found ? `No fork of ${t}` : 'No storyboard' })",
        "throw new TRPCError({ code: 'BAD_REQUEST', message: reason ?? 'Open a pull request.' })",
        "throw new TRPCError({ code: 'BAD_REQUEST', message: 'That ' + 'diff is too big.' })",
        "throw new TRPCError({ code: 'BAD_REQUEST', message })",
      ].join('\n')
      const findings = checkTrpcErrors(source, 'router.ts')
      expect(terms(findings)).toEqual(['merge', 'fork', 'storyboard', 'pull request', 'diff'])
      expect(findings.map((finding) => finding.line)).toEqual([3, 4, 4, 5, 6])
    })

    describe('on disk', () => {
      const dir = mkdtempSync(join(tmpdir(), 'vocabulary-server-'))
      afterAll(() => {
        vi.restoreAllMocks()
        rmSync(dir, { recursive: true, force: true })
      })

      it('leaves tests and prose out, and fails a run that finds something', () => {
        writeFileSync(join(dir, 'mail.ts'), "export const subject = 'Your storyboard is ready'\n")
        writeFileSync(join(dir, 'mail.test.ts'), "expect(subject).not.toContain('merge')\n")
        mkdirSync(join(dir, '__tests__'))
        writeFileSync(join(dir, '__tests__', 'x.ts'), "export const x = 'merge'\n")
        writeFileSync(join(dir, 'notes.md'), 'How the merge of two digests works.\n')

        const files = collectFiles([dir], { skipTests: true })
        expect(files.map((file) => basename(file))).toEqual(['mail.ts', 'notes.md'])
        expect(files.flatMap(checkServerFile).map((finding) => finding.term)).toEqual([
          'storyboard',
        ])

        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        expect(run(['--server', dir])).toBe(1)
        expect(quiet).toHaveBeenCalled()
        writeFileSync(join(dir, 'mail.ts'), "export const subject = 'Your story is ready'\n")
        expect(run(['--server', dir])).toBe(0)
      })
    })

    it('reads places that exist, so a moved file cannot drop out of the check unseen', () => {
      const root = fileURLToPath(new URL('..', import.meta.url))
      for (const path of [...SERVER_COPY_ROOTS, ...TRPC_ERROR_ROOTS]) {
        expect(existsSync(resolve(root, path)), path).toBe(true)
      }
    })
  })
})
