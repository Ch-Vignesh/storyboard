import { Fragment } from 'react'

import { safeParseDoc, type DocFlavour, type InlineNode } from '@/lib/doc/schema'

/**
 * Renders a stored document as semantic HTML.
 *
 * Deliberately not TipTap: the reader is the most-visited screen and the one
 * with the tightest budget (NFR-1, first contentful paint under 1.2 s on a slow
 * connection). A guest reading a public storyboard should not download an
 * editor to look at paragraphs.
 *
 * Headings render at their authored level so a screen reader gets the
 * manuscript's real structure (NFR-4).
 */

type Props = {
  content: unknown
  flavour?: DocFlavour
}

/** FR-4.1 allows levels 1 to 3 and the schema enforces it. */
const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3' } as const

function Inline({ nodes }: { nodes: readonly InlineNode[] | undefined }) {
  if (!nodes || nodes.length === 0) return null
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'hard_break') return <br key={index} />

        // Marks nest outwards in the order they are listed.
        let element: React.ReactNode = node.text
        for (const mark of node.marks ?? []) {
          if (mark.type === 'em') element = <em key={index}>{element}</em>
          else if (mark.type === 'strong') element = <strong key={index}>{element}</strong>
          else if (mark.type === 'strike') element = <s key={index}>{element}</s>
        }
        return <Fragment key={index}>{element}</Fragment>
      })}
    </>
  )
}

export function Manuscript({ content, flavour = 'prose' }: Props) {
  const parsed = safeParseDoc(content, flavour)
  if (!parsed.success) {
    // Stored documents are validated on write, so this is a corrupted row
    // rather than a user mistake. Say so plainly instead of rendering nothing.
    return (
      <p className="text-[13.5px] text-crimson">
        This section could not be displayed. Its earlier versions are still in the history.
      </p>
    )
  }

  const doc = parsed.data

  return (
    <>
      {doc.content.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={index}>
                <Inline nodes={block.content} />
              </p>
            )
          case 'heading': {
            // A lookup rather than a template string, so the element type stays
            // known to TypeScript and the levels match the schema's 1 to 3.
            const Tag = HEADINGS[block.attrs.level]
            return (
              <Tag key={index}>
                <Inline nodes={block.content} />
              </Tag>
            )
          }
          case 'blockquote':
            return (
              <blockquote key={index}>
                {block.content.map((paragraph, inner) => (
                  <p key={inner}>
                    <Inline nodes={paragraph.content} />
                  </p>
                ))}
              </blockquote>
            )
          case 'scene_break':
            // Decorative: the separation is the meaning, so it is hidden from
            // the accessibility tree rather than announced as "horizontal rule".
            return <hr key={index} aria-hidden className="scene-break" />
          // FR-4.2 — the screenplay elements. Listed rather than defaulted, so
          // adding a node type to the schema fails here instead of silently
          // rendering as a paragraph. The class carries the industry margins.
          case 'scene_heading':
          case 'action':
          case 'character':
          case 'parenthetical':
          case 'dialogue':
          case 'transition':
            return (
              <p key={index} className={`sp-${block.type}`}>
                <Inline nodes={block.content} />
              </p>
            )
        }
      })}
    </>
  )
}
