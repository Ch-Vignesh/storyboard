/**
 * Phase 14, item 9.5 — the seeded stories, held to the rules a person opening
 * the same requests would meet (FR-5.3, FR-5.4, FR-5.7, FR-5.8, FR-6.2, FR-6.9,
 * FR-13.2) and to the launch targets (FR-15.4, `SEED_TARGETS`).
 *
 * At the root, beside `check-excerpts.ts`, because the bounds live in the
 * application's `constants.ts` and `packages/db` must not import from the
 * application; every bound here is the constant itself, never a copy. Plain
 * data on both sides, so no database. Whether each excerpt is really the
 * edition's words is `pnpm check-excerpts`, which needs the network.
 *
 * Each rule is one test that lists every request breaking it, by story and
 * title, so a failure says what to fix.
 */
import { describe, expect, it } from 'vitest'

import {
  CONTINUE_TARGET_MAX_WORDS,
  DAILY_LIMITS,
  IDEA_WORDS,
  REQUEST_ASK_WORDS,
  REQUEST_PRE_CONTEXT_WORDS,
  REQUEST_TITLE_MAX_CHARS,
  REWRITE_TARGET_MIN_WORDS,
  SEED_TARGETS,
  SUGGESTION_NOTE_MAX_CHARS,
  SUGGESTION_NOTE_MAX_WORDS,
  SUGGESTION_QUOTA,
  SUGGESTION_WORDS,
} from '../apps/app/src/lib/schemas/constants'
import { countWords } from '../apps/app/src/lib/schemas/help'
import {
  EXAMPLE_REQUESTS,
  EXAMPLE_STORYBOARD,
} from '../packages/db/prisma/seed/storyboards/example-storyboard'
import {
  LIBRARY,
  SEED_HELPERS,
  type SeedRequest,
} from '../packages/db/prisma/seed/storyboards/library'
import { checkText } from './check-vocabulary'

/** Every seeded story in one shape: its sections' text by chapter, and its requests. */
type Story = {
  title: string
  genres: readonly string[]
  chapters: string[][]
  requests: readonly SeedRequest[]
}

const STORIES: Story[] = [
  {
    title: EXAMPLE_STORYBOARD.title,
    genres: EXAMPLE_STORYBOARD.genres,
    chapters: EXAMPLE_STORYBOARD.chapters.map((chapter) =>
      chapter.sections.map((paragraphs: readonly string[]) => paragraphs.join('\n\n')),
    ),
    requests: EXAMPLE_REQUESTS,
  },
  ...LIBRARY.map((work) => ({
    title: work.title,
    genres: work.genres,
    chapters: [work.chapter.sections],
    requests: work.requests,
  })),
]

type Entry = { story: Story; request: SeedRequest; name: string }

const ALL: Entry[] = STORIES.flatMap((story) =>
  story.requests.map((request) => ({ story, request, name: `${story.title}: ${request.title}` })),
)

/** The open ones: the requests a visitor can still answer. */
const isOpen = (request: SeedRequest) => request.accepted === undefined
const OPEN = ALL.filter(({ request }) => isOpen(request))

const sectionOf = ({ story, request }: Entry) =>
  story.chapters[request.chapter ?? 0]?.[request.section]

/** The entries a check finds fault with, each as "story: title — what is wrong". */
function faults(entries: readonly Entry[], check: (entry: Entry) => string[]): string[] {
  return entries.flatMap((entry) => check(entry).map((fault) => `${entry.name} — ${fault}`))
}

function within(what: string, value: number, bounds: { min: number; max: number }): string[] {
  return value < bounds.min || value > bounds.max
    ? [`${what} is ${String(value)}, wants ${String(bounds.min)} to ${String(bounds.max)}`]
    : []
}

describe('seeded requests are ones a person could have opened', () => {
  it('each has a title, an ask, and a section that exists (FR-5.3)', () => {
    expect(
      faults(ALL, (entry) => {
        const { story, request } = entry
        return [
          ...(request.title.trim() === request.title && request.title.length > 0
            ? []
            : ['a title with space around it, or none']),
          ...(request.title.length > REQUEST_TITLE_MAX_CHARS || /[\n\r\t]/u.test(request.title)
            ? ['a title too long for one line']
            : []),
          ...within('the ask, in words,', countWords(request.ask), REQUEST_ASK_WORDS),
          ...(sectionOf(entry) === undefined ? ['no such section'] : []),
          // The seed finds a request by its title on its story.
          ...(story.requests.filter((other) => other.title === request.title).length > 1
            ? ['a title another request on the story has']
            : []),
        ]
      }),
    ).toEqual([])
  })

  /*
   * The answered requests are history: they show the loop closed (FR-15.4),
   * were seeded before FR-5.4 and FR-5.7 were checked here, and stand on
   * openings far shorter than a rewrite now needs. Three of them are quoted on
   * the marketing page, and every database already has them, so they stay as
   * they are. Every request a visitor can still answer obeys both rules.
   */
  it('each open one asking for prose gives the story so far (FR-5.4)', () => {
    expect(
      faults(OPEN, ({ request }) =>
        request.kind === 'UNBLOCK'
          ? request.preContext === undefined
            ? []
            : ['a story so far, which a request for ideas does not take']
          : within(
              'the story so far, in words,',
              countWords(request.preContext ?? ''),
              REQUEST_PRE_CONTEXT_WORDS,
            ),
      ),
    ).toEqual([])
  })

  it('each open one stands on a section it may be asked of (FR-5.7)', () => {
    expect(
      faults(OPEN, (entry) => {
        const { story, request } = entry
        const words = countWords(sectionOf(entry) ?? '')
        if (request.kind === 'REWRITE' && words < REWRITE_TARGET_MIN_WORDS) {
          return [`a rewrite of ${String(words)} words`]
        }
        if (request.kind === 'CONTINUE') {
          // What comes next goes after the last section, so that is where it asks.
          const last = (story.chapters[request.chapter ?? 0] ?? []).length - 1
          return [
            ...(words < CONTINUE_TARGET_MAX_WORDS
              ? []
              : [`a continuation of ${String(words)} words`]),
            ...(request.section === last ? [] : ['a continuation before the end of its chapter']),
          ]
        }
        return []
      }),
    ).toEqual([])
  })

  it('never puts two open requests on one section (FR-5.1)', () => {
    const seen = new Set<string>()
    expect(
      faults(OPEN, ({ story, request }) => {
        const place = `${story.title} ${String(request.chapter ?? 0)}:${String(request.section)}`
        if (seen.has(place)) return ['a section another open request already has']
        seen.add(place)
        return []
      }),
    ).toEqual([])
  })
})

describe('the seeded help is help a person could have given (D-14)', () => {
  const helpers = new Set<string>(SEED_HELPERS.map((helper) => helper.username))
  const HELPED = ALL.filter(
    ({ request }) => request.suggestions !== undefined || request.ideas !== undefined,
  )

  it('answers only a request still taking answers, with the kind it asks for', () => {
    expect(
      faults(HELPED, ({ request }) => {
        const suggesters = (request.suggestions ?? []).map((suggestion) => suggestion.by)
        const thinkers = (request.ideas ?? []).map((idea) => idea.by)
        return [
          ...(isOpen(request) ? [] : ['help on an answered request']),
          ...(request.kind === 'UNBLOCK' && suggesters.length
            ? ['prose for a request for ideas']
            : []),
          ...(request.kind !== 'UNBLOCK' && thinkers.length
            ? ['ideas for a request for prose']
            : []),
          // One of each per helper per request: how a second seed run knows it is done.
          ...(new Set(suggesters).size === suggesters.length
            ? []
            : ['two suggestions from one helper']),
          ...(new Set(thinkers).size === thinkers.length ? [] : ['two ideas from one helper']),
          ...(thinkers.length <= helpers.size * DAILY_LIMITS.ideasPerRequest
            ? []
            : ['too many ideas']),
          ...[...suggesters, ...thinkers]
            .filter((name) => !helpers.has(name))
            .map((name) => `help from ${name}, who is not an example helper`),
        ]
      }),
    ).toEqual([])
  })

  it('keeps suggestions within their bounds (FR-5.8, FR-6.2)', () => {
    // Seeded requests keep the default range.
    const range = { min: SUGGESTION_WORDS.defaultMin, max: SUGGESTION_WORDS.defaultMax }
    const note = { min: 0, max: SUGGESTION_NOTE_MAX_WORDS }
    expect(
      faults(HELPED, (entry) =>
        (entry.request.suggestions ?? []).flatMap((suggestion) => [
          ...within(
            `${suggestion.by}'s suggestion, in words,`,
            countWords(suggestion.prose),
            range,
          ),
          ...within(`${suggestion.by}'s note, in words,`, countWords(suggestion.note), note),
          ...(suggestion.note.length <= SUGGESTION_NOTE_MAX_CHARS ? [] : ['a note too long']),
          // A rewrite that changes nothing is not one.
          ...(suggestion.prose === sectionOf(entry) ? ['a rewrite identical to the section'] : []),
        ]),
      ),
    ).toEqual([])
  })

  it('keeps ideas within their bounds (FR-6.9)', () => {
    expect(
      faults(HELPED, ({ request }) =>
        (request.ideas ?? []).flatMap((idea) =>
          within(`${idea.by}'s idea, in words,`, countWords(idea.body), IDEA_WORDS),
        ),
      ),
    ).toEqual([])
  })

  it('keeps each helper within the quota on each story (FR-13.2)', () => {
    const over = STORIES.flatMap((story) => {
      const sent = story.requests.flatMap((request) =>
        (request.suggestions ?? []).map((suggestion) => suggestion.by),
      )
      return [...helpers]
        .filter(
          (helper) => sent.filter((by) => by === helper).length > SUGGESTION_QUOTA.contributor,
        )
        .map((helper) => `${story.title}: ${helper}`)
    })
    expect(over).toEqual([])
  })

  it('shows both kinds, on a handful of requests, the first story included', () => {
    expect(HELPED.some(({ request }) => request.suggestions?.length)).toBe(true)
    expect(HELPED.some(({ request }) => request.ideas?.length)).toBe(true)
    // A handful, not the whole library: FR-15.1 seeds the request side, and
    // a place where everything is already answered needs nobody.
    expect(HELPED.length * 2).toBeLessThan(OPEN.length)
    // "Read it" on the marketing page opens this story first.
    expect(EXAMPLE_REQUESTS.some((request) => request.suggestions?.length)).toBe(true)
    expect(EXAMPLE_REQUESTS.some((request) => request.ideas?.length)).toBe(true)
  })
})

describe('the seeds meet their launch targets (FR-15.4)', () => {
  it('has the stories, the genres, and the open and answered requests', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(SEED_TARGETS.storyboards)
    expect(new Set(STORIES.flatMap((story) => story.genres)).size).toBeGreaterThanOrEqual(
      SEED_TARGETS.genres,
    )
    expect(OPEN.length).toBeGreaterThanOrEqual(SEED_TARGETS.openRequests)
    expect(ALL.length - OPEN.length).toBeGreaterThanOrEqual(SEED_TARGETS.answeredRequests)
    expect(new Set(OPEN.map(({ request }) => request.kind))).toEqual(
      new Set(['REWRITE', 'CONTINUE', 'UNBLOCK']),
    )
  })

  it('leaves rewrites open, across genres (item 9.5)', () => {
    const rewrites = OPEN.filter(({ request }) => request.kind === 'REWRITE')
    expect(rewrites.length).toBeGreaterThanOrEqual(SEED_TARGETS.openRewrites)
    expect(new Set(rewrites.flatMap(({ story }) => story.genres)).size).toBeGreaterThanOrEqual(
      SEED_TARGETS.genres,
    )
  })

  it('gives The Yellow Wallpaper one open request of each kind, two in its first chapter', () => {
    // FR-1.1's sixty seconds end on a stuck passage, and "Read it" opens here.
    const open = EXAMPLE_REQUESTS.filter(isOpen)
    expect(open.map((request) => request.kind).sort()).toEqual(['CONTINUE', 'REWRITE', 'UNBLOCK'])
    expect(open.filter((request) => (request.chapter ?? 0) === 0).length).toBeGreaterThanOrEqual(2)
  })
})

it('writes its own words in the product’s language (01-srs.md §2)', () => {
  // The excerpts are their authors' words and may say what they like; what
  // the seed wrote itself is shown as plainly as any label.
  expect(
    faults(ALL, ({ request }) =>
      [
        request.title,
        request.ask,
        request.preContext ?? '',
        request.accepted?.note ?? '',
        ...(request.suggestions ?? []).map((suggestion) => suggestion.note),
        ...(request.ideas ?? []).map((idea) => idea.body),
      ]
        .flatMap((text) => checkText(text, 'seed'))
        .map((finding) => `"${finding.text}": say ${finding.sayInstead}`),
    ),
  ).toEqual([])
})
