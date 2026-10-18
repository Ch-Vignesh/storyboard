import type { PrismaClient } from './generated/prisma/client'

/**
 * Decision 0043 — the one administrator, set from the command line and never
 * from the interface, so a compromised admin session cannot hand the role on.
 * Promotes the account at `email` and demotes whoever held the role, in one
 * transaction, demotion first: the `one_admin` index allows one at a time.
 * `isAdmin` is kept in step while the column exists.
 */
export async function grantAdmin(
  db: PrismaClient,
  email: string,
): Promise<{ promotedId: string; demoted: string[] }> {
  return db.$transaction(async (tx) => {
    const next = await tx.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    })
    if (!next) throw new Error(`No account has the address ${email}.`)
    if (next.status !== 'ACTIVE') throw new Error('That account is not active.')

    const previous = await tx.user.findMany({
      where: { role: 'ADMIN', id: { not: next.id } },
      select: { email: true },
    })
    await tx.user.updateMany({
      where: { role: 'ADMIN', id: { not: next.id } },
      data: { role: 'USER', isAdmin: false },
    })
    await tx.user.update({ where: { id: next.id }, data: { role: 'ADMIN', isAdmin: true } })
    return { promotedId: next.id, demoted: previous.map((user) => user.email) }
  })
}
