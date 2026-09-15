import { describe, expect, it } from 'vitest'

import { needsAnAccount } from './protected-routes'

/**
 * The gate, read back as the requirement.
 *
 * This list was the proxy's `matcher` until the Content-Security-Policy needed
 * the proxy to run everywhere (phase 9, OD-10). Moving a gate from framework
 * configuration into a predicate is the kind of change that fails silently in
 * both directions — a public page that starts asking for a password, or a
 * private one that stops — so both directions are asserted.
 */
describe('which routes need a session', () => {
  it.each([
    ['/', 'the dashboard'],
    ['/new', 'creating a storyboard'],
    ['/notifications', 'notifications'],
    ['/settings', 'settings'],
    ['/settings/email', 'a settings subpage'],
    ['/onboarding/username', 'onboarding'],
    ['/onboarding/genres', 'onboarding'],
    ['/import', 'import'],
    ['/import/review', 'the boundary review'],
    ['/admin', 'the admin screens'],
    ['/admin/reports', 'the report queue'],
    ['/s/a-novel-abc123/c/1/2/edit', 'the editor'],
    ['/s/a-novel-abc123/help/new', 'opening a request'],
    ['/s/a-novel-abc123/help/xyz789/write', 'writing a suggestion'],
    ['/s/a-novel-abc123/settings', "a storyboard's settings"],
  ])('%s needs one — %s', (path) => {
    expect(needsAnAccount(path)).toBe(true)
  })

  /**
   * FR-1.2. A guest reads a public storyboard without an account, and this is
   * the half that a careless matcher breaks: the reader is the page most people
   * see first, and gating it would turn every shared link into a sign-up wall.
   */
  it.each([
    ['/s/a-novel-abc123', 'the reader'],
    ['/s/a-novel-abc123/c/1/2', 'a section'],
    ['/s/a-novel-abc123/contributors', 'the contributors page'],
    ['/s/a-novel-abc123/help/xyz789', 'reading a request'],
    ['/s/a-novel-abc123/lineage', 'the lineage page'],
    ['/s/a-novel-abc123/versions', 'the versions panel'],
    ['/browse', 'browse'],
    ['/rules', 'the community rules'],
    ['/signin', 'signing in'],
    ['/signup', 'signing up'],
    ['/verify', 'the verification link'],
    ['/@someone', 'a profile'],
  ])('%s does not — %s', (path) => {
    expect(needsAnAccount(path)).toBe(false)
  })

  it('does not gate a storyboard whose slug merely contains a protected word', () => {
    // `/s/settings-for-beginners-abc123` is a storyboard, not a settings page.
    expect(needsAnAccount('/s/settings-for-beginners-abc123')).toBe(false)
    expect(needsAnAccount('/s/new-beginnings-abc123')).toBe(false)
  })

  it('anchors at both ends, so nothing is gated by a prefix alone', () => {
    // `/newsletter` starts with `/new` and is not the create-a-storyboard page.
    expect(needsAnAccount('/newsletter')).toBe(false)
    expect(needsAnAccount('/settingsomething')).toBe(false)
  })
})
