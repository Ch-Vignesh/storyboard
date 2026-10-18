/**
 * Phase 14, items 6.3 and 6.4 (FR-13.2, FR-13.3) — what a person may still
 * send on a story, said the same way on the request page and in the
 * composer. The numbers come from `suggestion.allowance`.
 */
export type Allowance = {
  /** Suggestions that may wait on this story at once; null on your own story. */
  quota: number | null
  waiting: number
  sendsLeftToday: number
}

export function quotaFull(allowance: Allowance | null | undefined): boolean {
  return allowance?.quota !== null && allowance !== null && allowance !== undefined
    ? allowance.waiting >= allowance.quota
    : false
}

/** "1 of your 3 suggestions waiting on this story · 9 sends left today" */
export function allowanceLine(allowance: Allowance): string {
  const sends = `${String(allowance.sendsLeftToday)} ${allowance.sendsLeftToday === 1 ? 'send' : 'sends'} left today`
  if (allowance.quota === null) return `Your own story: no cap on what waits · ${sends}`
  return `${String(allowance.waiting)} of your ${String(allowance.quota)} suggestions waiting on this story · ${sends}`
}

/** Why Send is off, when the quota is the reason. */
export function quotaFullLine(allowance: Allowance): string {
  return `You can write now and send when one of your ${String(allowance.quota ?? 0)} is decided.`
}
