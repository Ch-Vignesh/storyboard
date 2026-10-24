import { TRPCClientError } from '@trpc/client'

/**
 * Phase 14, item 8.5 — words that have not reached the server yet, kept on
 * this device until they do. The editor and the suggestion composer keep a
 * copy as the writer types, forget it once a save has everything, and offer
 * it back when a page opens on older text than the copy.
 *
 * Browser storage can be missing, full or refused (a private window), so
 * every call is guarded: losing the copy loses only the second chance, never
 * the page.
 */

const PREFIX = 'draftboard:unsaved:'

export type LocalCopy = { contentJson: unknown; at: number }

export function readLocalCopy(key: string): LocalCopy | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalCopy> | null
    if (!parsed || typeof parsed.at !== 'number' || !parsed.contentJson) return null
    return { contentJson: parsed.contentJson, at: parsed.at }
  } catch {
    return null
  }
}

export function keepLocalCopy(key: string, contentJson: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ contentJson, at: Date.now() }))
  } catch {
    // Storage full or refused: the server save is still on its way.
  }
}

export function forgetLocalCopy(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // Nothing to forget, or no storage to forget it in.
  }
}

/**
 * True when the server never answered — the connection, not a refusal. A
 * refusal carries the server's own sentence and is shown as it is; this is
 * tried again.
 */
export function couldNotReach(caught: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return caught instanceof TRPCClientError && !caught.data
}

/** The status line while it waits, said once for both places that save. */
export const KEPT_ON_DEVICE = 'Couldn’t save. Your words are kept on this device. Trying again…'
