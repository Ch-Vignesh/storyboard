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
  }
}
