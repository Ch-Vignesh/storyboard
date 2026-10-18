import type { Role as AccountRole } from '@storyboard/db'

/**
 * Decision 0043 (phase 14, items 2b.1 to 2b.3) — what an administrator may
 * do, as a fixed list. The admin has all of it; a sub-admin has what the admin
 * granted; a user has none. Checked at the data layer by
 * `adminProcedure(capability)` and by the admin pages, never by a component
 * alone (NFR-6). Not the story roles of `matrix.ts`: those are about a story.
 */

/** What the admin may hand to a sub-admin, one grant each. */
export const GRANTABLE_CAPABILITIES = [
  'overview.read',
  'reports.decide',
  'accounts.suspend',
  'accounts.delete',
  'names.ban',
  'seeds.manage',
  'flags.toggle',
  'events.read',
  'errors.read',
] as const

/**
 * The admin's alone, and no grant confers it: handing out powers is not a
 * power to hand out. It is what makes a sub-admin and sets their grants.
 */
export const ADMIN_ONLY_CAPABILITIES = ['roles.manage'] as const

export const ADMIN_CAPABILITIES = [...GRANTABLE_CAPABILITIES, ...ADMIN_ONLY_CAPABILITIES] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]
export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number]

/**
 * A greater power carries the lesser: whoever may delete an account may
 * suspend one, since the People screen that deletes is the one that suspends.
 */
const IMPLIES: Partial<Record<GrantableCapability, readonly GrantableCapability[]>> = {
  'accounts.delete': ['accounts.suspend'],
}

/** The account as the request context carries it: role, standing, and a sub-admin's grants. */
export type AdminActor = {
  role: AccountRole
  status: string
  deletionRequestedAt: Date | null
  grants?: readonly string[]
} | null

export function canAdmin(actor: AdminActor, capability: AdminCapability): boolean {
  // Standing first (phase 12 audit): a suspended admin, or one whose account
  // is being deleted, has no powers for as long as that lasts.
  if (actor?.status !== 'ACTIVE' || actor.deletionRequestedAt) return false
  if (actor.role === 'ADMIN') return true
  if (actor.role === 'SUB_ADMIN') {
    if (!isGrantable(capability)) return false
    const wanted: GrantableCapability = capability
    return (actor.grants ?? []).some(
      (grant) =>
        grant === wanted || (isGrantable(grant) && (IMPLIES[grant] ?? []).includes(wanted)),
    )
  }
  return false
}

export function isGrantable(capability: string): capability is GrantableCapability {
  return (GRANTABLE_CAPABILITIES as readonly string[]).includes(capability)
}

/** What each capability is called on the People screen (item 2b.5). */
export const CAPABILITY_LABELS: Record<AdminCapability, string> = {
  'overview.read': 'See the overview',
  'reports.decide': 'Decide reports',
  'accounts.suspend': 'Suspend and ban accounts',
  'accounts.delete': 'Delete accounts',
  'names.ban': 'Ban usernames',
  'seeds.manage': 'Manage seeded stories',
  'flags.toggle': 'Switch feature flags',
  'events.read': 'Read the event log',
  'errors.read': 'Read the error log',
  'roles.manage': 'Make sub-admins and set their grants',
}
