/* eslint-disable @typescript-eslint/consistent-type-definitions -- module augmentation requires interfaces */
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /** What `authorize()` returns and the jwt callback receives on sign-in. */
  interface User {
    username?: string | null
    onboarded?: boolean
  }

  /** What `auth()` and `useSession()` expose. */
  interface Session {
    user: {
      id: string
      username: string | null
      onboarded: boolean
    } & DefaultSession['user']
    /**
     * When this session signed in, in milliseconds (decision 0036's claim),
     * for the few things that want a recent one: a Google-only account
     * changing its address (item 3.2). Absent on a token from before it.
     */
    authAt?: number
  }
}
