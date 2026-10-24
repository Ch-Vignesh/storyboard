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
 * Server copy (phase 14, item 10.4), a second mode, read by default too: words
 * written on the server that a person reads all the same.
 *   - Every string in the emails, the notification copy, the names of what a
 *     person may do (`lib/authz`), what an export prints around the manuscript,
 *     and why an import was refused (`SERVER_COPY_ROOTS`). Strings that are
 *     plainly identifiers are not copy: no spaces, and a `:` or a `.` in them,
 *     like `storyboard:delete`, `purge.account` or an address.
 *   - The `message` of every `new TRPCError({ … })` in `apps/app/src/server`,
 *     which is what a person sees when a call fails.
 *   - Tests are not read; they hold the wrong words on purpose.
 *
 * Escape hatch: put `vocabulary-ok` in a comment on the same line or the line
 * above. Use it for the rare legitimate case (the proof-of-authorship export
 * must say "SHA-256"), never to save a rewrite.
 *
 * Usage
 *   pnpm check-vocabulary                       scan the default roots, both modes
 *   pnpm check-vocabulary <path>...             scan these as interface copy
 *   pnpm check-vocabulary --server <path>...    scan every string in these as server copy
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
  { term: 'repository', pattern: /\brepositor(?:y|ies)\b/i, sayInstead: 'story' },
  // Phase 12: the product is Draftboard, and what a writer makes is a story
  // (or a script or manuscript, by type). "Storyboard" belongs to film, which
  // is why the product was renamed; it survives only in code and package names.
  {
    term: 'storyboard',
    pattern: /\bstoryboards?\b/i,
    sayInstead: 'story (script, manuscript by type), or Draftboard for the product',
  },
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

/**
 * Phase 14, item 10.4 — server copy: every string in these is read by
 * somebody. The emails, the notifications, the names of what a person may do,
 * what an export prints around the manuscript, and import's reasons.
 */
export const SERVER_COPY_ROOTS = [
  'apps/app/src/server/mail',
  'apps/app/src/lib/schemas/notifications.ts',
  'apps/app/src/lib/authz',
  'packages/export/src',
  'packages/import/src',
  'apps/app/src/server/trpc/routers/import.ts',
]

/** Item 10.4 — where a `new TRPCError({ message })` is thrown; only the message is read. */
export const TRPC_ERROR_ROOTS = ['apps/app/src/server']

const CODE_EXTENSIONS = new Set(['.ts', '.tsx'])
const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.txt'])
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'generated', 'api'])
const ESCAPE = 'vocabulary-ok'

/** A test holds the wrong words on purpose, to prove they are caught. */
const TEST_FILE = /(?:\.test\.tsx?$|[\\/]__tests__[\\/])/u

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

/** A string whose place makes it code, whatever it says: a module, a key, a type. */
function isCodePosition(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  const parent = node.parent
  // Module specifiers, directives and dynamic imports are code, not copy.
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true
  if (ts.isExternalModuleReference(parent) || ts.isImportAttribute(parent)) return true
  if (ts.isExpressionStatement(parent)) return true
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
    return true
  // Keys, index access, type literals and enum members are identifiers in disguise.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true
  if (ts.isLiteralTypeNode(parent) || ts.isEnumMember(parent)) return true
  // `case 'storyboards':` compares a key; whatever it returns is the copy.
  if (ts.isCaseClause(parent)) return true
  return ts.isPropertySignature(parent) || ts.isMethodSignature(parent)
}

function isUserFacingText(node: ts.Node): node is TextNode {
  if (ts.isJsxText(node)) return true
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return !insideClassNameHelper(node.parent)
  }
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false
  if (isCodePosition(node)) return false

  const parent = node.parent
  // JSX attributes: only the ones people read.
  if (ts.isJsxAttribute(parent)) return COPY_ATTRIBUTES.has(parent.name.getText())
  return !insideClassNameHelper(node)
}

/**
 * Item 10.4 — an identifier written as a string, not copy. No spaces, and
 * either a `:` or a `.` in it (`storyboard:delete`, `purge.account`, an
 * address), or only capitals, digits and underscores: an enum value or a code,
 * like `COMMITTED` or `BAD_REQUEST`. Copy is in sentence case, so no word of
 * it looks like that.
 */
export function isIdentifierLike(text: string): boolean {
  if (/\s/u.test(text)) return false
  return /[:.]/u.test(text) || /^[A-Z][A-Z0-9_]*$/u.test(text)
}

/** Item 10.4 — in server copy every string is read by somebody, unless it is code. */
function isServerCopy(node: ts.Node): node is TextNode {
  if (ts.isJsxText(node)) return true
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return true
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false
  return !isCodePosition(node)
}

/** The `message` given to `new TRPCError({ … })`, if this node is one. */
function trpcErrorMessage(node: ts.Node): ts.Expression | undefined {
  if (!ts.isNewExpression(node) || !ts.isIdentifier(node.expression)) return undefined
  if (node.expression.text !== 'TRPCError') return undefined
  const options = node.arguments?.[0]
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'message') {
      return property.initializer
    }
  }
  return undefined
}

/**
 * The words a message can be, through the ways one is written: a literal, a
 * template, one of two, a join, a fallback. A message held in a variable or
 * made by a call is not followed; the strings at its source are, if they are
 * in a file this reads as server copy.
 */
function messageTexts(expression: ts.Expression): TextNode[] {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return [expression]
  }
  if (ts.isTemplateExpression(expression)) {
    return [
      expression.head,
      ...expression.templateSpans.flatMap((span) => [
        ...messageTexts(span.expression),
        span.literal,
      ]),
    ]
  }
  if (ts.isParenthesizedExpression(expression)) return messageTexts(expression.expression)
  if (ts.isConditionalExpression(expression)) {
    return [...messageTexts(expression.whenTrue), ...messageTexts(expression.whenFalse)]
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind
    if (
      operator === ts.SyntaxKind.PlusToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken ||
      operator === ts.SyntaxKind.BarBarToken
    ) {
      return [...messageTexts(expression.left), ...messageTexts(expression.right)]
    }
  }
  return []
}

/**
 * Walk TypeScript or TSX source, reporting banned terms in the text nodes
 * `pick` chooses. `pick` returns the nodes to read and stops the walk there,
 * or `undefined` to look further in.
 */
function scan(
  source: string,
  file: string,
  pick: (node: ts.Node) => readonly TextNode[] | undefined,
): Finding[] {
  const findings: Finding[] = []
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const lines = source.split('\n')

  const visit = (node: ts.Node): void => {
    const texts = pick(node)
    if (!texts) {
      ts.forEachChild(node, visit)
      return
    }
    for (const text of texts) {
      // JsxText keeps its leading whitespace in .text, so its raw start (pos) is
      // the anchor. Every other text node opens with a one-character delimiter.
      const anchor = ts.isJsxText(text) ? text.pos : text.getStart(sourceFile) + 1
      for (const hit of findMatches(text.text)) {
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
    }
  }
  visit(sourceFile)
  return findings
}

/** Scan TypeScript or TSX source. `file` is used for reporting and script-kind detection. */
export function checkCode(source: string, file: string): Finding[] {
  return scan(source, file, (node) => (isUserFacingText(node) ? [node] : undefined))
}

/** Item 10.4 — scan server copy: every string, unless it is code or an identifier. */
export function checkServerCode(source: string, file: string): Finding[] {
  return scan(source, file, (node) => {
    if (!isServerCopy(node)) return undefined
    return isIdentifierLike(node.text) ? [] : [node]
  })
}

/** Item 10.4 — scan the message of every `new TRPCError({ … })`, and nothing else. */
export function checkTrpcErrors(source: string, file: string): Finding[] {
  return scan(source, file, (node) => {
    const message = trpcErrorMessage(node)
    if (!message) return undefined
    return messageTexts(message).filter((text) => !isIdentifierLike(text.text))
  })
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

/** Item 10.4 — a file of server copy. Code only: its prose files are documentation. */
export function checkServerFile(path: string): Finding[] {
  if (!CODE_EXTENSIONS.has(extname(path))) return []
  return checkServerCode(readFileSync(path, 'utf8'), path)
}

/** Item 10.4 — the `TRPCError` messages in a file of server code. */
export function checkTrpcErrorFile(path: string): Finding[] {
  if (!CODE_EXTENSIONS.has(extname(path))) return []
  return checkTrpcErrors(readFileSync(path, 'utf8'), path)
}

export function collectFiles(
  roots: readonly string[],
  /** Item 10.4 — the server passes leave tests out. */
  options: { skipTests?: boolean } = {},
): string[] {
  const files: string[] = []
  const walk = (path: string): void => {
    if (!existsSync(path)) return
    const stats = statSync(path)
    if (stats.isFile()) {
      const extension = extname(path)
      if (options.skipTests && TEST_FILE.test(path)) return
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

type Pass = { files: string[]; check: (path: string) => Finding[] }

/** Item 10.4 — the passes a run makes: interface copy, server copy, `TRPCError` messages. */
function passesFor(args: readonly string[]): Pass[] {
  const server = args.includes('--server')
  const paths = args.filter((arg) => arg !== '--server')
  const at = (roots: readonly string[]) => roots.map((root) => resolve(REPO_ROOT, root))

  if (paths.length > 0) {
    return [
      server
        ? { files: collectFiles(at(paths), { skipTests: true }), check: checkServerFile }
        : { files: collectFiles(at(paths)), check: checkFile },
    ]
  }

  const serverPasses: Pass[] = [
    { files: collectFiles(at(SERVER_COPY_ROOTS), { skipTests: true }), check: checkServerFile },
    { files: collectFiles(at(TRPC_ERROR_ROOTS), { skipTests: true }), check: checkTrpcErrorFile },
  ]
  if (server) return serverPasses
  return [{ files: collectFiles(at(DEFAULT_ROOTS)), check: checkFile }, ...serverPasses]
}

export function run(args: readonly string[]): number {
  const passes = passesFor(args)
  const files = new Set(passes.flatMap((pass) => pass.files))

  // A `TRPCError` in a file of server copy is read by two passes; say it once.
  const seen = new Set<string>()
  const findings = passes
    .flatMap(({ files: paths, check }) => paths.flatMap(check))
    .filter((finding) => {
      const key = `${finding.file}:${String(finding.line)}:${String(finding.column)}:${finding.term}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  if (findings.length === 0) {
    console.warn(`vocabulary: ${String(files.size)} files, nothing to change`)
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
