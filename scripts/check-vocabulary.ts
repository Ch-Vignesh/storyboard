/**
 * Vocabulary linter (docs/01-srs.md §2).
 *
 * The interface never speaks git. This script scans user-facing source for the
 * banned terms and exits non-zero when it finds one.
 *
 * What is checked
 *   - In .ts/.tsx files: string literals, template literals and JSX text.
 *     Identifiers, comments, import paths, directives, type literals, object
 *     keys and class-name plumbing are ignored, so `mergeSections()` is fine
 *     and "Merge into main" is not.
 *   - In .md/.mdx/.json/.txt files: every line.
 *
 * Escape hatch: put `vocabulary-ok` in a comment on the same line or the line
 * above. Use it for the rare legitimate case (the proof-of-authorship export
 * must say "SHA-256"), never to save a rewrite.
 *
 * Usage
 *   pnpm check-vocabulary              scan the default roots
 *   pnpm check-vocabulary <path>...    scan specific files or directories
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import ts from 'typescript'

export type BannedTerm = { term: string; pattern: RegExp; sayInstead: string }

/** Normative source: the "Never say" columns of docs/01-srs.md §2. */
export const BANNED_TERMS: readonly BannedTerm[] = [
  { term: 'branch', pattern: /\bbranch(?:es|ed|ing)?\b/i, sayInstead: 'alternate version' },
  { term: 'merge', pattern: /\bmerg(?:e|es|ed|ing)\b/i, sayInstead: 'accept' },
  { term: 'commit', pattern: /\bcommit(?:s|ted|ting)?\b/i, sayInstead: 'save, or version' },
  {
    term: 'fork',
    pattern: /\bfork(?:s|ed|ing)?\b/i,
    sayInstead: 'spin-off, or write my own version',
  },
  { term: 'pull request', pattern: /\bpull[ -]requests?\b/i, sayInstead: 'suggestion' },
  { term: 'diff', pattern: /\bdiffs?\b/i, sayInstead: 'comparison, or what changed' },
  { term: 'repository', pattern: /\brepositor(?:y|ies)\b/i, sayInstead: 'storyboard' },
  { term: 'master', pattern: /\bmaster\b/i, sayInstead: 'the main draft' },
  { term: 'revert', pattern: /\brevert(?:s|ed|ing)?\b/i, sayInstead: 'restore an earlier version' },
  {
    term: 'rollback',
    pattern: /\broll(?:ed|ing)?[ -]?backs?\b/i,
    sayInstead: 'restore an earlier version',
  },
  { term: 'clone', pattern: /\bclon(?:e|es|ed|ing)\b/i, sayInstead: 'write my own version' },
  { term: 'patch', pattern: /\bpatch(?:es|ed|ing)?\b/i, sayInstead: 'suggestion' },
  { term: 'SHA', pattern: /\bSHA(?:-?\d+)?\b/, sayInstead: 'version 4, or saved on 12 Sep' },
]

export type Finding = {
  file: string
  line: number
  column: number
  term: string
  text: string
  sayInstead: string
}

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Where user-facing copy lives. `api/` route handlers inside them are skipped. */
export const DEFAULT_ROOTS = [
  'apps/app/src/app',
  'apps/app/src/components',
  'apps/app/messages',
  'apps/web/src/app',
  'apps/web/src/components',
  'apps/web/messages',
  'packages/ui/src',
]

const CODE_EXTENSIONS = new Set(['.ts', '.tsx'])
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.txt'])
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'generated', 'api'])
const ESCAPE = 'vocabulary-ok'

/** JSX attributes whose values are read by people. Everything else is plumbing. */
const COPY_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'content',
  'description',
  'label',
  'placeholder',
  'title',
])

/** Calls whose string arguments are class names, not copy. */
const CLASS_NAME_HELPERS = new Set(['cn', 'cva', 'clsx', 'twMerge'])

function findMatches(text: string): Array<{ term: BannedTerm; index: number; match: string }> {
  const hits: Array<{ term: BannedTerm; index: number; match: string }> = []
  for (const term of BANNED_TERMS) {
    const flags = term.pattern.flags.includes('g') ? term.pattern.flags : `${term.pattern.flags}g`
    const global = new RegExp(term.pattern.source, flags)
    for (const match of text.matchAll(global)) {
      hits.push({ term, index: match.index, match: match[0] })
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\{\/\*|\*)/

/** Escaped when the marker is on the same line, or on a comment-only line directly above. */
function isEscaped(lines: readonly string[], lineIndex: number): boolean {
  const here = lines[lineIndex] ?? ''
  if (here.includes(ESCAPE)) return true
  const above = lineIndex > 0 ? (lines[lineIndex - 1] ?? '') : ''
  return COMMENT_LINE.test(above) && above.includes(ESCAPE)
}

type TextNode =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail
  | ts.JsxText

function insideClassNameHelper(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      return CLASS_NAME_HELPERS.has(current.expression.text)
    }
    current = current.parent
  }
  return false
}

function isUserFacingText(node: ts.Node): node is TextNode {
  if (ts.isJsxText(node)) return true
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return !insideClassNameHelper(node.parent)
  }
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false

  const parent = node.parent
  // Module specifiers, directives and dynamic imports are code, not copy.
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false
  if (ts.isExternalModuleReference(parent) || ts.isImportAttribute(parent)) return false
  if (ts.isExpressionStatement(parent)) return false
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
    return false
  // Keys, index access, type literals and enum members are identifiers in disguise.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false
  if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) return false
  if (ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) return false
  // JSX attributes: only the ones people read.
  if (ts.isJsxAttribute(parent)) return COPY_ATTRIBUTES.has(parent.name.getText())
  return !insideClassNameHelper(node)
}

/** Scan TypeScript or TSX source. `file` is used for reporting and script-kind detection. */
export function checkCode(source: string, file: string): Finding[] {
  const findings: Finding[] = []
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const lines = source.split('\n')

  const visit = (node: ts.Node): void => {
    if (isUserFacingText(node)) {
      // JsxText keeps its leading whitespace in .text, so its raw start (pos) is
      // the anchor. Every other text node opens with a one-character delimiter.
      const anchor = ts.isJsxText(node) ? node.pos : node.getStart(sourceFile) + 1
      for (const hit of findMatches(node.text)) {
        const position = anchor + hit.index
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
        if (isEscaped(lines, line)) continue
        findings.push({
          file,
          line: line + 1,
          column: character + 1,
          term: hit.term.term,
          text: hit.match,
          sayInstead: hit.term.sayInstead,
        })
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return findings
}

/** Scan prose or data files line by line. */
export function checkText(source: string, file: string): Finding[] {
  const findings: Finding[] = []
  const lines = source.split('\n')
  lines.forEach((content, index) => {
    if (isEscaped(lines, index)) return
    for (const hit of findMatches(content)) {
      findings.push({
        file,
        line: index + 1,
        column: hit.index + 1,
        term: hit.term.term,
        text: hit.match,
        sayInstead: hit.term.sayInstead,
      })
    }
  })
  return findings
}

export function checkFile(path: string): Finding[] {
  const extension = extname(path)
  const source = readFileSync(path, 'utf8')
  if (CODE_EXTENSIONS.has(extension)) return checkCode(source, path)
  if (TEXT_EXTENSIONS.has(extension)) return checkText(source, path)
  return []
}

export function collectFiles(roots: readonly string[]): string[] {
  const files: string[] = []
  const walk = (path: string): void => {
    if (!existsSync(path)) return
    const stats = statSync(path)
    if (stats.isFile()) {
      const extension = extname(path)
      if (CODE_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension)) files.push(path)
      return
    }
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
      walk(join(path, entry.name))
    }
  }
  roots.forEach(walk)
  return files.sort()
}

export function formatFinding(finding: Finding, root = REPO_ROOT): string {
  const location = `${relative(root, finding.file).replaceAll('\\', '/')}:${String(finding.line)}:${String(finding.column)}`
  return `${location}  "${finding.text}"  ->  say "${finding.sayInstead}"`
}

export function run(args: readonly string[]): number {
  const roots = (args.length > 0 ? args : DEFAULT_ROOTS).map((root) => resolve(REPO_ROOT, root))
  const files = collectFiles(roots)
  const findings = files.flatMap(checkFile)

  if (findings.length === 0) {
    console.warn(`vocabulary: ${String(files.length)} files, nothing to change`)
    return 0
  }

  console.error(`vocabulary: ${String(findings.length)} banned term(s) in user-facing text\n`)
  for (const finding of findings) console.error(`  ${formatFinding(finding)}`)
  console.error(
    '\nThe interface never speaks git (docs/01-srs.md section 2). Reword, or add a `vocabulary-ok` comment on the line above for the rare legitimate exception.',
  )
  return 1
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (invokedDirectly) {
  process.exitCode = run(process.argv.slice(2))
}
