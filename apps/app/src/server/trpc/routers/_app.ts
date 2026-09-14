import { createCallerFactory, createTRPCRouter } from '../init'
import { authRouter } from './auth'
import { browseRouter } from './browse'
import { chapterRouter } from './chapter'
import { compareRouter } from './compare'
import { creditRouter } from './credit'
import { ideaRouter } from './idea'
import { notificationRouter } from './notification'
import { profileRouter } from './profile'
import { requestRouter } from './request'
import { sectionRouter } from './section'
import { settingsRouter } from './settings'
import { storyboardRouter } from './storyboard'
import { suggestionRouter } from './suggestion'
import { userRouter } from './user'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  user: userRouter,
  storyboard: storyboardRouter,
  chapter: chapterRouter,
  section: sectionRouter,
  request: requestRouter,
  suggestion: suggestionRouter,
  idea: ideaRouter,
  compare: compareRouter,
  credit: creditRouter,
  browse: browseRouter,
  profile: profileRouter,
  settings: settingsRouter,
  notification: notificationRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
