import { createCallerFactory, createTRPCRouter } from '../init'
import { adminRouter } from './admin'
import { authRouter } from './auth'
import { blockRouter } from './block'
import { browseRouter } from './browse'
import { chapterRouter } from './chapter'
import { coauthorRouter } from './coauthor'
import { compareRouter } from './compare'
import { creditRouter } from './credit'
import { ideaRouter } from './idea'
import { importRouter } from './import'
import { notificationRouter } from './notification'
import { profileRouter } from './profile'
import { publicationRouter } from './publication'
import { proofRouter } from './proof'
import { reportRouter } from './report'
import { requestRouter } from './request'
import { sectionRouter } from './section'
import { settingsRouter } from './settings'
import { spinOffRouter } from './spinoff'
import { storyboardRouter } from './storyboard'
import { suggestionRouter } from './suggestion'
import { versionRouter } from './version'
import { userRouter } from './user'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  admin: adminRouter,
  user: userRouter,
  storyboard: storyboardRouter,
  chapter: chapterRouter,
  section: sectionRouter,
  request: requestRouter,
  report: reportRouter,
  suggestion: suggestionRouter,
  idea: ideaRouter,
  import: importRouter,
  compare: compareRouter,
  credit: creditRouter,
  proof: proofRouter,
  browse: browseRouter,
  profile: profileRouter,
  settings: settingsRouter,
  version: versionRouter,
  publication: publicationRouter,
  spinOff: spinOffRouter,
  notification: notificationRouter,
  coauthor: coauthorRouter,
  block: blockRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
