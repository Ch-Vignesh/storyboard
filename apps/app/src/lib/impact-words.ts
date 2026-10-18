import { nameOf, type Person } from '@/lib/people'

/**
 * Phase 14, milestone 5 — the consequences a confirmation dialog states, in
 * the same words everywhere. The numbers come from the server's impact
 * procedures; nothing here is guessed.
 */
export type RequestsImpact = { openRequests: number; told: Person[] }

/** "2 open requests close, and Maya and Leah will be told." */
export function requestsSentence(impact: RequestsImpact | undefined): string {
  if (!impact) return 'Working out what this would do…'
  if (impact.openRequests === 0) return 'No open requests are affected.'
  const requests =
    impact.openRequests === 1
      ? '1 open request closes'
      : `${String(impact.openRequests)} open requests close`
  const told =
    impact.told.length === 0
      ? 'nobody is waiting on them'
      : `${listOf(impact.told.map(nameOf))} will be told`
  return `${requests}, and ${told}.`
}

/** "2 people with a draft or a waiting suggestion will be told: Maya and Leah." */
export function toldSentence(told: Person[] | undefined, who: string): string {
  if (!told) return 'Working out who would be told…'
  if (told.length === 0) return `Nobody ${who} is waiting on it.`
  const count = told.length === 1 ? '1 person' : `${String(told.length)} people`
  return `${count} ${who} will be told: ${listOf(told.map(nameOf))}.`
}

/** "Maya", "Maya and Leah", "Maya, Leah and Sam". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}
