'use client'

import { PASSWORD_RULES } from '@/lib/schemas/auth'

/**
 * D-17 (phase 14, item 3.9) — the rule under every new-password field,
 * ticking as the person types, so nobody meets it for the first time as a
 * refusal. The same list the server checks, in the same order.
 */
export function PasswordRules({ value, id }: { value: string; id: string }) {
  return (
    <ul id={id} aria-live="polite" className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.met(value)
        return (
          <li key={rule.key} className={met ? 'text-moss' : 'text-ink-faint'}>
            <span aria-hidden>{met ? '✓' : '○'} </span>
            {rule.label}
            <span className="sr-only">{met ? ', done' : ', still needed'}</span>
          </li>
        )
      })}
    </ul>
  )
}
