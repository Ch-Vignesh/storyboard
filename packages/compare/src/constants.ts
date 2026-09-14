/**
 * Every threshold the comparison engine uses, in one place
 * (architecture section 4). Do not copy these numbers into the algorithm; a
 * constant that exists in two files will drift, and these two in particular
 * decide whether a writer sees marks or a clean read-through.
 */

/**
 * Two paragraphs are "the same paragraph, edited" at or above this Dice
 * coefficient on word bigrams, and "different paragraphs" below it.
 *
 * **Why 0.45.** A paragraph a writer *edited* typically retains over half its
 * bigrams — they change a clause, a name, the rhythm of one sentence. A
 * paragraph they *replaced* retains under a third, because the shared bigrams
 * are only the common function words any two English sentences have. 0.45 sits
 * in the gap, closer to the replacement end so that a genuine rewrite is not
 * dressed up as an edit.
 *
 * Tune against real data once there are accepted suggestions to look at; that
 * is a phase 2 follow-up, not a phase 7 one, because the cost of being wrong
 * here is a comparison view nobody can read.
 */
export const PARAGRAPH_PAIR_THRESHOLD = 0.45

/**
 * Below this share of aligned paragraphs the whole comparison switches to
 * read-through mode and every word mark is dropped (FR-7.2.3).
 *
 * **Why 0.30.** Under a third aligned means the text was rewritten rather than
 * edited, and word-level marks on a rewrite are visual noise: almost every word
 * is struck or underlined, so the marks carry no information and actively
 * obstruct reading. The honest response is to stop marking and let the reader
 * read.
 */
export const REWRITE_ALIGNMENT_THRESHOLD = 0.3

/**
 * NFR-2: comparison must complete in under 400 ms for a 2000-word section.
 * Exported so the performance test states the budget rather than inventing one.
 */
export const COMPARISON_BUDGET_MS = 400
