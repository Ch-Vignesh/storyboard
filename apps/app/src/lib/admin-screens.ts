import { type AdminActor, type AdminCapability, canAdmin } from './authz/admin'

/**
 * Decision 0043 (phase 14, item 2b.7) — the admin panel's screens, each
 * behind its capability. The layout lists the ones this person may open; a
 * screen they may not open is a 404, as it is to anyone else.
 */
export const ADMIN_SCREENS = [
  { href: '/admin', label: 'Overview', capability: 'overview.read' },
  { href: '/admin/reports', label: 'Reports', capability: 'reports.decide' },
  { href: '/admin/people', label: 'People', capability: 'accounts.suspend' },
  { href: '/admin/names', label: 'Names', capability: 'names.ban' },
  { href: '/admin/seeds', label: 'Seeds', capability: 'seeds.manage' },
  { href: '/admin/flags', label: 'Flags', capability: 'flags.toggle' },
] as const satisfies ReadonlyArray<{ href: string; label: string; capability: AdminCapability }>

export type AdminScreen = (typeof ADMIN_SCREENS)[number]

export function screensFor(actor: AdminActor): AdminScreen[] {
  return ADMIN_SCREENS.filter((screen) => canAdmin(actor, screen.capability))
}

/** Where "Admin" in the header leads: the first screen this person may open, or nowhere. */
export function adminHome(actor: AdminActor): string | null {
  return screensFor(actor)[0]?.href ?? null
}
