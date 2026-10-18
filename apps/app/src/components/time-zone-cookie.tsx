'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { TIME_ZONE_COOKIE_DAYS } from '@/lib/schemas/constants'
import { TIME_ZONE_COOKIE } from '@/lib/time-zone'

/**
 * Item 1.18 — tells the server which time zone this browser is in, as a
 * cookie, so server components can write dates in it. Renders nothing. The
 * page on screen was rendered before the cookie existed, so the first time
 * it is set the page is rendered once more.
 */
export function TimeZoneCookie() {
  const router = useRouter()

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) return
    const value = encodeURIComponent(zone)
    const current = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1)
    if (current === value) return
    const secure = location.protocol === 'https:' ? '; secure' : ''
    const maxAge = TIME_ZONE_COOKIE_DAYS * 24 * 60 * 60
    document.cookie = `${TIME_ZONE_COOKIE}=${value}; path=/; max-age=${String(maxAge)}; samesite=lax${secure}`
    router.refresh()
  }, [router])

  return null
}
