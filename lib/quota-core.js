// Shared quota vocabulary: format errors, window classification and number
// helpers every provider parser and the recorder agree on. Provider-specific
// wire shapes live in quota-providers.js; the service and history store live
// in quota.js.
import { isRecord } from './search.js'

export const WEEKLY_THRESHOLD_SECONDS = 172_800
export const MONTHLY_THRESHOLD_SECONDS = 21 * 86_400

export class QuotaFormatError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QuotaFormatError'
  }
}

export const clampInt = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return fallback
  return n
}

export const clampPercent = value => Math.min(100, Math.max(0, value))

/** Classify a rate-limit window by its duration, never by its field position. */
export function windowKind(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < WEEKLY_THRESHOLD_SECONDS) return 'short'
  return seconds >= MONTHLY_THRESHOLD_SECONDS ? 'monthly' : 'weekly'
}

/** Coerce a wire count (string or number) to a finite number, or undefined. */
export function finiteNumber(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Epoch seconds for a wire timestamp in ms, seconds, or ISO text. */
export function epochSeconds(value) {
  const n = finiteNumber(value)
  if (n !== undefined) return Math.floor(n > 1e12 ? n / 1000 : n)
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
  }
  return undefined
}

/**
 * One normalized quota window every provider parser produces and the panel
 * renders: a duration class, the used percentage, the raw window length when
 * the wire states one, and the reset instant in epoch seconds.
 */
export function quotaWindow({ kind, usedPercent, windowSeconds, resetAt }) {
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) return undefined
  return {
    kind: kind ?? windowKind(windowSeconds),
    usedPercent: clampPercent(usedPercent),
    ...(typeof windowSeconds === 'number' && Number.isFinite(windowSeconds) && windowSeconds > 0 ? { windowSeconds: Math.floor(windowSeconds) } : {}),
    ...(typeof resetAt === 'number' && Number.isFinite(resetAt) ? { resetAt: Math.floor(resetAt) } : {}),
  }
}

export { isRecord }
