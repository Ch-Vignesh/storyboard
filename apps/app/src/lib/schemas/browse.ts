import { z } from 'zod'

import { SUGGESTION_WORDS } from './constants'
import { requestKindSchema } from './help'
import { storyTypeSchema } from './storyboard'

/**
 * FR-11.3 — the browse filters and sorts, and FR-11.6's deliberate limit on
 * search. Shared by the page and the router so the URL, the form and the query
 * cannot disagree.
 */

/**
 * FR-11.3 — three sorts, and no opaque ranking. Every one of them is a rule a
 * reader can state out loud, which is the point: "recently opened" is not a
 * relevance score.
 */
export const BROWSE_SORTS = [
  {
    value: 'RECENT',
    label: 'Recently opened',
    blurb: 'Newest first.',
  },
  {
    value: 'CLOSING_SOON',
    label: 'Waiting longest',
    blurb: 'Approaching the point where the author gets nudged.',
  },
  {
    value: 'NO_ANSWERS',
    label: 'No answers yet',
    blurb: 'Nobody has replied to these at all.',
  },
] as const

export const browseSortSchema = z.enum(['RECENT', 'CLOSING_SOON', 'NO_ANSWERS'])
export type BrowseSort = z.infer<typeof browseSortSchema>

/** FR-11.3 — "age" as a filter, in the words a person would use. */
export const AGE_FILTERS = [
  { value: 'ANY', label: 'Any time', days: null },
  { value: 'WEEK', label: 'This week', days: 7 },
  { value: 'MONTH', label: 'This month', days: 30 },
] as const

export const ageFilterSchema = z.enum(['ANY', 'WEEK', 'MONTH'])

export const browseFiltersSchema = z.object({
  /** FR-11.6 — title and author name only. Full-text over manuscripts is
   * deferred: it has privacy implications on unpublished work that need a
   * policy first. */
  query: z.string().trim().max(100).optional(),
  genreIds: z.array(z.string().min(1)).max(24).optional(),
  types: z.array(storyTypeSchema).max(9).optional(),
  kinds: z.array(requestKindSchema).max(3).optional(),
  minWords: z.number().int().min(SUGGESTION_WORDS.floor).max(SUGGESTION_WORDS.ceiling).optional(),
  maxWords: z.number().int().min(SUGGESTION_WORDS.floor).max(SUGGESTION_WORDS.ceiling).optional(),
  age: ageFilterSchema.default('ANY'),
  sort: browseSortSchema.default('RECENT'),
  take: z.number().int().min(1).max(50).default(24),
})

export type BrowseFilters = z.infer<typeof browseFiltersSchema>

/**
 * Reads the filters out of a URL, so browse is linkable and back works.
 *
 * Anything unparseable falls back to the defaults rather than throwing. A URL
 * is something anyone can type, edit or truncate, and `/browse?sort=nonsense`
 * should show the default ordering, not a 500.
 */
export function filtersFromParams(params: URLSearchParams): BrowseFilters {
  const list = (key: string) => {
    const value = params
      .getAll(key)
      .flatMap((entry) => entry.split(','))
      .filter(Boolean)
    return value.length > 0 ? value : undefined
  }
  const number = (key: string) => {
    const raw = params.get(key)
    if (raw === null) return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const parsed = browseFiltersSchema.safeParse({
    query: params.get('q') ?? undefined,
    genreIds: list('genre'),
    types: list('type'),
    kinds: list('kind'),
    minWords: number('min'),
    maxWords: number('max'),
    age: params.get('age') ?? 'ANY',
    sort: params.get('sort') ?? 'RECENT',
  })
  if (parsed.success) return parsed.data

  // One bad parameter should not discard the rest, so retry without the fields
  // that failed before giving up on all of them.
  const bad = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))
  const retry = browseFiltersSchema.safeParse({
    query: bad.has('query') ? undefined : (params.get('q') ?? undefined),
    genreIds: bad.has('genreIds') ? undefined : list('genre'),
    types: bad.has('types') ? undefined : list('type'),
    kinds: bad.has('kinds') ? undefined : list('kind'),
    minWords: bad.has('minWords') ? undefined : number('min'),
    maxWords: bad.has('maxWords') ? undefined : number('max'),
    age: bad.has('age') ? 'ANY' : (params.get('age') ?? 'ANY'),
    sort: bad.has('sort') ? 'RECENT' : (params.get('sort') ?? 'RECENT'),
  })

  return retry.success ? retry.data : browseFiltersSchema.parse({})
}

/** The reverse, for building links that keep the current filters. */
export function paramsFromFilters(filters: Partial<BrowseFilters>): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.genreIds?.length) params.set('genre', filters.genreIds.join(','))
  if (filters.types?.length) params.set('type', filters.types.join(','))
  if (filters.kinds?.length) params.set('kind', filters.kinds.join(','))
  if (filters.minWords !== undefined) params.set('min', String(filters.minWords))
  if (filters.maxWords !== undefined) params.set('max', String(filters.maxWords))
  if (filters.age && filters.age !== 'ANY') params.set('age', filters.age)
  if (filters.sort && filters.sort !== 'RECENT') params.set('sort', filters.sort)
  return params
}
