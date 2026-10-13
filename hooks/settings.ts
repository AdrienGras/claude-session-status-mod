// The person's choices for the card, kept across sessions in $.store and read leniently.
import type { CardLine, Settings } from '../types'

export const CARD_LINES: readonly CardLine[] = ['model', 'context', 'five_hour', 'seven_day', 'cost', 'repo']

export const DEFAULT_SETTINGS: Settings = { cardLines: ['model', 'context', 'five_hour'], barWidth: 10 }

const MIN_WIDTH = 6
const MAX_WIDTH = 24
const KEY = 'settings'

/** Anything stored, or nothing, as valid settings: unknown lines dropped, width clamped. */
export const normalizeSettings = (raw: unknown): Settings => {
  const r = (raw ?? {}) as { cardLines?: unknown; barWidth?: unknown }
  const cardLines = Array.isArray(r.cardLines)
    ? r.cardLines.filter((l, i, all): l is CardLine => CARD_LINES.includes(l as CardLine) && all.indexOf(l) === i)
    : [...DEFAULT_SETTINGS.cardLines]
  const width = typeof r.barWidth === 'number' && Number.isFinite(r.barWidth) ? Math.round(r.barWidth) : DEFAULT_SETTINGS.barWidth
  return { cardLines, barWidth: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) }
}

/** The part of `$` settings use: the engine's, or a test's. */
export type StoreDeps = { store: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> } }

export const loadSettings = async ($: StoreDeps): Promise<Settings> => normalizeSettings(await $.store.get(KEY))

export const saveSettings = async ($: StoreDeps, s: Settings): Promise<void> => $.store.set(KEY, normalizeSettings(s))
