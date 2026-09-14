# 0009 — Reading preferences live on the user, not in the browser

Date: 2026-09-14 · Status: accepted

## Context

NFR-5 asks for a manuscript measure of 62–68 characters and "adjustable type
size and line height persisted per user". `02-architecture.md` section 3 gives
`User` no column for either, so phase 1 had to decide where they live.

`localStorage` is the cheap answer and it is the wrong one: it is per browser,
not per user. A writer who reads on a laptop and a tablet would set their type
size twice and lose it on every new device, which is precisely the case a
reading-comfort requirement exists to serve.

## Decision

Two integer columns on `User`:

| Column              | Default | Meaning                             |
| ------------------- | ------- | ----------------------------------- |
| `readingTypeScale`  | 100     | Percent of the 19px manuscript size |
| `readingLineHeight` | 168     | Percent, i.e. the 1.68 line height  |

Percentages of the design tokens rather than absolute px or unitless floats:
integers avoid rounding drift, the defaults stay legible against
`--text-manuscript` in `packages/ui`, and the permitted range is a pair of
integer bounds in `lib/schemas/constants.ts` like every other bound.

The measure itself (62–68ch) is not adjustable and stays a token. It is a
typographic constant, not a preference.

## Consequences

- Preferences follow the reader to any device they sign in on.
- A signed-out guest reading a public storyboard (FR-1.2) gets the defaults and
  no controls. Offering a setting that cannot be saved would be worse than not
  offering it; the control appears when they sign in.
- One more migration in phase 1 (`20260914152253_reading_preferences`).
