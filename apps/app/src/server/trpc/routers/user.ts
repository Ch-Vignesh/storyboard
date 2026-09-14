import { createTRPCRouter, protectedProcedure } from '../init'

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        onboardedAt: true,
        createdAt: true,
      },
    }),
  ),
})
