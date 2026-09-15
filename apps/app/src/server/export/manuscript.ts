import 'server-only'

import type { Manuscript } from '@storyboard/export'
import { TRPCError } from '@trpc/server'

import { env } from '@/env'
import { parseDoc, flavourForStoryType } from '@/lib/doc/schema'
import { nameOf } from '@/lib/people'
import type { PrismaClient } from '@storyboard/db'

/**
 * A storyboard, assembled into the shape the exporters read (FR-14).
 *
 * One query pass, one shape, four formats. The contributors list is built here
 * rather than in each exporter so that FR-14.3's promise — credit travels with
 * the work — has exactly one implementation to be right or wrong.
 */

const CREDIT_ROLES = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

export async function assembleManuscript(
  db: PrismaClient,
  storyboardId: string,
  versionId?: string,
): Promise<Manuscript> {
  const storyboard = await db.storyboard.findUniqueOrThrow({
    where: { id: storyboardId },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      rightsNote: true,
      owner: { select: { username: true, displayName: true } },
    },
  })

  const version = await db.version.findFirst({
    where: versionId ? { id: versionId, storyboardId } : { storyboardId, isMain: true },
    select: { id: true },
  })
  if (!version) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
  }

  const chapters = await db.chapter.findMany({
    where: { versionId: version.id, deletedAt: null },
    orderBy: { order: 'asc' },
    select: {
      title: true,
      sections: {
        where: { deletedAt: null, mergedIntoId: null },
        orderBy: { order: 'asc' },
        select: {
          title: true,
          currentRevision: { select: { contentJson: true } },
        },
      },
    },
  })

  const flavour = flavourForStoryType(storyboard.type)

  // FR-9.2's list, in the order people earned their place in it. An erased
  // contributor (decision 0013) still appears, named as the interface names
  // them: the contribution happened, and the export should not pretend it did
  // not just because the person is no longer attached to it.
  const credits = await db.credit.findMany({
    where: { storyboardId },
    orderBy: { createdAt: 'asc' },
    select: {
      type: true,
      contributor: { select: { username: true, displayName: true } },
    },
  })

  const seen = new Set<string>()
  const contributors = credits
    .map((credit) => ({
      name: nameOf(credit.contributor),
      role: CREDIT_ROLES[credit.type],
    }))
    .filter((contributor) => {
      const key = `${contributor.name}|${contributor.role}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return {
    title: storyboard.title,
    author: nameOf(storyboard.owner),
    sourceUrl: `${env.NEXT_PUBLIC_APP_URL}/s/${storyboard.slug}`,
    rightsNote: storyboard.rightsNote,
    contributors,
    isScreenplay: flavour === 'screenplay',
    exportedAt: new Date(),
    chapters: chapters.map((chapter) => ({
      title: chapter.title,
      sections: chapter.sections.map((section) => ({
        title: section.title,
        // Stored JSON is `unknown` until it has been through the schema; an
        // export is no reason to skip that (FR-4.1).
        doc: parseDoc(
          section.currentRevision?.contentJson ?? { type: 'doc', content: [] },
          flavour,
        ),
      })),
    })),
  }
}
