// Figures derived from the session's readings.
import type { Speed } from '../types'

/**
 * How fast a request answered, from three clock readings: sent, first piece of response, stop.
 * Null when no response came; `tokPerS` null without usage or decode time to divide by.
 */
export const stepSpeed = (sentAt: number, firstAt: number | null, stopAt: number, outTokens: number | null): Speed | null => {
  if (firstAt === null) return null
  const decodeMs = stopAt - firstAt
  return {
    ttftMs: Math.max(0, firstAt - sentAt),
    tokPerS: outTokens !== null && outTokens > 0 && decodeMs > 0 ? (outTokens * 1000) / decodeMs : null,
  }
}

const MIN_SPAN_MS = 60_000

/** Cost per hour since `startedAt` and per prompt; null where it would be made up. */
export const costRates = (
  costUsd: number | undefined,
  startedAt: number,
  now: number,
  prompts: number,
): { perHour: number | null; perPrompt: number | null } => {
  if (costUsd === undefined) return { perHour: null, perPrompt: null }
  const span = now - startedAt
  return {
    perHour: span >= MIN_SPAN_MS ? costUsd / (span / 3_600_000) : null,
    perPrompt: prompts > 0 ? costUsd / prompts : null,
  }
}
