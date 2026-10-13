// Burn rate on a rate-limit window, ported from burn-bar.py: will the current pace last until the reset?
import type { ThemeKey } from 'claude-code'

import { fmtDur } from './format'
import { S } from './strings'
import type { RateLimit } from '../types'

export const WINDOW_MS = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 86_400_000,
} as const

/** Below this share of the window elapsed, the projection is too noisy to alarm on. */
const CONFIDENCE_FLOOR = 0.1

export type Burn = {
  usedPct: number
  elapsedFrac: number
  remainingMs: number
  projection: number
  juiceMs: number
  marginMs: number
  isLowConfidence: boolean
}

/**
 * The window is of fixed length, so it began at `resetsAtMs - durationMs`. Null outside it: past the
 * reset the reading is the last window's; a reset over a window ahead means a clock is off.
 */
export const computeBurn = (usedPct: number, resetsAtMs: number, durationMs: number, nowMs: number): Burn | null => {
  if (durationMs <= 0 || !Number.isFinite(resetsAtMs)) return null
  if (nowMs >= resetsAtMs || resetsAtMs - nowMs > durationMs) return null
  const used = Math.max(0, usedPct)
  const elapsed = nowMs - (resetsAtMs - durationMs)
  const elapsedFrac = Math.min(1, Math.max(1e-6, elapsed / durationMs))
  const remainingMs = Math.max(0, resetsAtMs - nowMs)
  let projection = 0
  let juiceMs = Infinity
  if (used > 0) {
    projection = used / elapsedFrac
    const rate = used / (elapsedFrac * durationMs) // points of % per ms
    juiceMs = Math.max(0, 100 - used) / rate
  }
  const marginMs = juiceMs === Infinity ? Infinity : juiceMs - remainingMs
  return { usedPct: used, elapsedFrac, remainingMs, projection, juiceMs, marginMs, isLowConfidence: elapsedFrac < CONFIDENCE_FLOOR }
}

/**
 * A window as the last response reported it: its burn; `stale` once its reset has passed (the figure
 * is the old window's until a reply brings the new one); null for a plain gauge (no length or reset).
 */
export const readQuota = (r: RateLimit, nowMs: number): Burn | 'stale' | null => {
  const resetsAt = r.resetsAt ? Date.parse(r.resetsAt) : Number.NaN
  if (Number.isFinite(resetsAt) && nowMs >= resetsAt) return 'stale'
  const duration = WINDOW_MS[r.kind as keyof typeof WINDOW_MS]
  return duration ? computeBurn(r.percentUsed, resetsAt, duration, nowMs) : null
}

/** `⛔ limit`, `✓ ∞`, `✓ +7h30`, `⚠ wall 1h04`. */
export const burnVerdict = (b: Burn): string => {
  if (b.usedPct >= 100) return `⛔ ${S.limit}`
  if (b.marginMs === Infinity) return '✓ ∞'
  if (b.marginMs >= 0) return `✓ +${fmtDur(b.marginMs)}`
  return `⚠ ${S.wall} ${fmtDur(b.juiceMs)}`
}

/** `→ 40%`, `→ ~60%` when low confidence, capped at `>999%`. */
export const projectionText = (b: Burn): string => {
  const tilde = b.isLowConfidence ? '~' : ''
  const p = Math.min(999, Math.round(b.projection))
  return p >= 999 ? `→ ${tilde}>999%` : `→ ${tilde}${p}%`
}

export const projectionTone = (b: Burn): ThemeKey => {
  if (b.isLowConfidence) return 'inactive'
  if (b.projection >= 130) return 'error'
  if (b.projection >= 80) return 'warning'
  return 'success'
}

export const contextTone = (pct: number): ThemeKey => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')
