import { FORMATS, STRATEGIES } from '@storyboard/import'
import { z } from 'zod'

/**
 * What a writer may send back after reviewing a proposal (FR-3.2).
 *
 * The review screen can move, add and remove every boundary, so what returns is
 * not the proposal that went out — it is whatever the writer made of it. The
 * only things the server keeps from its own copy are the *blocks*: prose is
 * never round-tripped through the browser, so an edited proposal can rearrange
 * the manuscript but cannot alter a word of it.
 */

export const formatSchema = z.enum(FORMATS)
export const strategySchema = z.enum(STRATEGIES)

export const confirmedSectionSchema = z.object({
  /** Indices into the parsed block list, both inclusive. */
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  title: z.string().trim().max(200).optional(),
})

export const confirmedChapterSchema = z.object({
  title: z.string().trim().min(1, 'Every chapter needs a name.').max(200),
  sections: z
    .array(confirmedSectionSchema)
    .min(1, 'A chapter needs at least one section.')
    // A section is a unit somebody writes in and asks for help on (FR-5.1).
    // Thousands of them in one chapter is not a manuscript; it is a way to
    // make one request write a great many rows.
    .max(500, 'That is more sections than one chapter can hold.'),
})

export const confirmedOutlineSchema = z
  .array(confirmedChapterSchema)
  .min(1, 'There is nothing to import.')
  .max(500, 'That is more chapters than a manuscript can have here.')

export type ConfirmedOutline = z.infer<typeof confirmedOutlineSchema>
export type ConfirmedChapter = z.infer<typeof confirmedChapterSchema>
