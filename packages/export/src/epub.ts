import { zipSync, strToU8 } from 'fflate'

import { frontMatterLines } from './front-matter'
import type { BlockNode, ExportChapter, InlineNode, Manuscript } from './types'

/**
 * FR-14.2's fourth format, deferred twice and closed in phase 9.
 *
 * An `.epub` is a zip of XHTML with a manifest, and the awkward parts are all
 * in the container rather than in the prose:
 *
 * - `mimetype` must be the **first** entry and **stored uncompressed**. A
 *   reader that follows the specification looks at bytes 30..50 of the archive
 *   to identify the file, so getting this wrong produces a zip that most
 *   software opens and a strict validator rejects.
 * - Every content document is XHTML, not HTML. Unclosed tags and bare
 *   ampersands are errors rather than things a browser forgives.
 * - Every file in the spine has to be declared in the manifest, with an id.
 *
 * What it shares with the other three exporters is the part that matters:
 * `frontMatterLines` builds the contributors page, so the credit travels by
 * default here exactly as it does in `.docx` and `.pdf` (FR-14.3).
 */

/** The five characters XML cannot carry raw. Ampersand first, or it double-escapes. */
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function inline(nodes: InlineNode[] | BlockNode[] | undefined): string {
  if (!nodes) return ''
  return (nodes as InlineNode[])
    .map((node) => {
      if (node.type === 'hard_break') return '<br/>'
      if (node.type !== 'text' || !node.text) return ''

      const marks = new Set((node.marks ?? []).map((mark) => mark.type))
      let value = escape(node.text)
      // Innermost first, so nested marks nest rather than interleave.
      if (marks.has('em')) value = `<em>${value}</em>`
      if (marks.has('strong')) value = `<strong>${value}</strong>`
      if (marks.has('strike')) value = `<s>${value}</s>`
      return value
    })
    .join('')
}

function block(node: BlockNode): string {
  switch (node.type) {
    case 'heading': {
      // Chapter titles are h1 and section titles h2, so a manuscript heading
      // starts at h3 and never outranks the structure around it.
      const level = Math.min(Math.max(node.attrs?.level ?? 1, 1), 3) + 2
      return `<h${String(level)}>${inline(node.content)}</h${String(level)}>`
    }
    case 'blockquote':
      return `<blockquote>${(node.content as BlockNode[])
        .map((child) => `<p>${inline(child.content)}</p>`)
        .join('')}</blockquote>`
    case 'scene_break':
      // FR-3.4's glyph, and an aria-hidden separator so a screen reader is not
      // made to read three asterisks aloud.
      return '<p class="scene-break" role="separator" aria-label="Scene break">* * *</p>'
    // FR-4.2's screenplay elements. Classed rather than styled inline so the
    // stylesheet is the one place that decides what a screenplay looks like.
    case 'scene_heading':
      return `<p class="scene-heading">${inline(node.content).toUpperCase()}</p>`
    case 'character':
      return `<p class="character">${inline(node.content).toUpperCase()}</p>`
    case 'dialogue':
      return `<p class="dialogue">${inline(node.content)}</p>`
    case 'parenthetical':
      return `<p class="parenthetical">${inline(node.content)}</p>`
    case 'transition':
      return `<p class="transition">${inline(node.content).toUpperCase()}</p>`
    default: {
      const text = inline(node.content)
      // An empty paragraph in the source should not become a blank <p> that
      // some readers render as a stray line of space.
      return text ? `<p>${text}</p>` : ''
    }
  }
}

function xhtml(title: string, body: string, isScreenplay: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
<meta charset="utf-8"/>
<title>${escape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="${isScreenplay ? 'screenplay' : 'prose'}">
${body}
</body>
</html>
`
}

function chapterDocument(chapter: ExportChapter, isScreenplay: boolean): string {
  const parts = [`<h1>${escape(chapter.title)}</h1>`]

  for (const section of chapter.sections) {
    if (section.title) parts.push(`<h2>${escape(section.title)}</h2>`)
    for (const node of section.doc.content) {
      const rendered = block(node)
      if (rendered) parts.push(rendered)
    }
  }

  return xhtml(chapter.title, parts.join('\n'), isScreenplay)
}

/** FR-14.3 — the title page and the contributors, before a word of the manuscript. */
function titleDocument(manuscript: Manuscript): string {
  const parts = ['<section epub:type="titlepage" class="titlepage">']

  for (const line of frontMatterLines(manuscript)) {
    if (!line.text) continue
    parts.push(
      line.emphasis
        ? `<p class="emphasis">${escape(line.text)}</p>`
        : `<p>${escape(line.text)}</p>`,
    )
  }

  parts.push('</section>')
  return xhtml(manuscript.title, parts.join('\n'), manuscript.isScreenplay)
}

function navDocument(manuscript: Manuscript): string {
  const items = manuscript.chapters
    .map(
      (chapter, index) =>
        `<li><a href="chapter-${String(index + 1)}.xhtml">${escape(chapter.title)}</a></li>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
<li><a href="title.xhtml">Title page</a></li>
${items}
</ol>
</nav>
</body>
</html>
`
}

function opf(manuscript: Manuscript, identifier: string): string {
  const chapterItems = manuscript.chapters
    .map(
      (_, index) =>
        `<item id="chapter-${String(index + 1)}" href="chapter-${String(index + 1)}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n')
  const chapterRefs = manuscript.chapters
    .map((_, index) => `<itemref idref="chapter-${String(index + 1)}"/>`)
    .join('\n')

  // `dcterms:modified` must be UTC to the second, with no milliseconds.
  const modified = `${manuscript.exportedAt.toISOString().slice(0, 19)}Z`

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">${escape(identifier)}</dc:identifier>
<dc:title>${escape(manuscript.title)}</dc:title>
<dc:language>en</dc:language>
<dc:creator>${escape(manuscript.author)}</dc:creator>
${manuscript.contributors
  .map((contributor) => `<dc:contributor>${escape(contributor.name)}</dc:contributor>`)
  .join('\n')}
<dc:source>${escape(manuscript.sourceUrl)}</dc:source>
${manuscript.rightsNote?.trim() ? `<dc:rights>${escape(manuscript.rightsNote.trim())}</dc:rights>` : ''}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="style" href="style.css" media-type="text/css"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${chapterItems}
</manifest>
<spine>
<itemref idref="title"/>
${chapterRefs}
</spine>
</package>
`
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`

/**
 * Deliberately sparse.
 *
 * A reading device has a font, a size and a margin its owner chose, and an
 * exported manuscript that overrides them is worse than one that does not.
 * What is set here is only what carries meaning: the indented-paragraph
 * convention of printed prose, and the screenplay shapes FR-4.2 names.
 */
const STYLESHEET = `body { margin: 0 5%; }
h1, h2 { font-weight: normal; text-align: center; margin: 2em 0 1em; }
p { margin: 0; text-indent: 1.4em; line-height: 1.5; }
/* A paragraph after a heading or a break starts flush, as print does. */
h1 + p, h2 + p, .scene-break + p, .titlepage p { text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
.scene-break { text-align: center; text-indent: 0; margin: 1.4em 0; }
.titlepage { text-align: center; margin-top: 20%; }
.titlepage p { margin: 0.35em 0; }
.titlepage .emphasis { font-size: 1.3em; margin: 0.8em 0; }
.screenplay p { text-indent: 0; margin: 1em 0; }
.screenplay .scene-heading { font-weight: bold; text-transform: uppercase; }
.screenplay .character { margin: 1em 0 0 35%; text-transform: uppercase; }
.screenplay .parenthetical { margin: 0 0 0 30%; }
.screenplay .dialogue { margin: 0 20% 0 20%; }
.screenplay .transition { text-align: right; }
`

export function toEpub(manuscript: Manuscript): Buffer {
  // Stable and derived from the storyboard's own address, so exporting the same
  // manuscript twice does not produce two books a library would treat as
  // different. `dcterms:modified` is what changes between exports.
  const identifier = `urn:storyboard:${manuscript.sourceUrl}`

  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // First, and stored. See the note at the top of this file.
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [strToU8(CONTAINER), { level: 6 }],
    'OEBPS/content.opf': [strToU8(opf(manuscript, identifier)), { level: 6 }],
    'OEBPS/nav.xhtml': [strToU8(navDocument(manuscript)), { level: 6 }],
    'OEBPS/style.css': [strToU8(STYLESHEET), { level: 6 }],
    'OEBPS/title.xhtml': [strToU8(titleDocument(manuscript)), { level: 6 }],
  }

  manuscript.chapters.forEach((chapter, index) => {
    files[`OEBPS/chapter-${String(index + 1)}.xhtml`] = [
      strToU8(chapterDocument(chapter, manuscript.isScreenplay)),
      { level: 6 },
    ]
  })

  return Buffer.from(zipSync(files, { mtime: manuscript.exportedAt }))
}
