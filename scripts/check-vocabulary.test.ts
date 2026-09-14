import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { checkCode, checkFile, checkText, collectFiles } from './check-vocabulary'

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
})
