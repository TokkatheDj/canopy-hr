import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A Date as yyyy-mm-dd in the VIEWER'S OWN timezone, for prefilling
 * <input type="date">.
 *
 * Not `toISOString().slice(0, 10)`, which formats in UTC. Portland is UTC-7,
 * so after 5pm local that returns TOMORROW: every date field defaulted to
 * "today" silently pre-filled the next day, and a job or comp change saved in
 * the evening was future-dated by one day. Harmless-looking until something
 * keys off the effective date — which adminAddJobChange now does.
 *
 * Stored dates are a different matter: they are written at T00:00:00Z and must
 * keep being read back in UTC, so `toISOString()` stays correct for those.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Today, yyyy-mm-dd, in the viewer's timezone. See toLocalISODate. */
export function todayLocalISO(): string {
  return toLocalISODate(new Date())
}
