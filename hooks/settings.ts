// The person's choices for the card, kept across sessions in $.store and read leniently.
import type { CardLine, HintLayout, Settings } from '../types'

export const CARD_LINES: readonly CardLine[] = ['model', 'context', 'five_hour', 'seven_day', 'cost', 'repo']

export const DEFAULT_SETTINGS: Settings = { cardLines: ['model', 'context', 'five_hour'], barWidth: 10, hintLayout: 'inline' }

const HINT_LAYOUTS: readonly HintLayout[] = ['inline', 'below']

const MIN_WIDTH = 6
const MAX_WIDTH = 24
/** The $.store key the settings live under. */
export const SETTINGS_KEY = 'settings'

/** Anything stored, or nothing, as valid settings: unknown lines dropped, width clamped, layout defaulted. */
export const normalizeSettings = (raw: unknown): Settings => {
  const r = (raw ?? {}) as { cardLines?: unknown; barWidth?: unknown; hintLayout?: unknown }
  const cardLines = Array.isArray(r.cardLines)
    ? r.cardLines.filter((l, i, all): l is CardLine => CARD_LINES.includes(l as CardLine) && all.indexOf(l) === i)
    : [...DEFAULT_SETTINGS.cardLines]
  const width = typeof r.barWidth === 'number' && Number.isFinite(r.barWidth) ? Math.round(r.barWidth) : DEFAULT_SETTINGS.barWidth
  const hintLayout = HINT_LAYOUTS.includes(r.hintLayout as HintLayout) ? (r.hintLayout as HintLayout) : DEFAULT_SETTINGS.hintLayout
  return { cardLines, barWidth: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)), hintLayout }
}

/** Every line once: those on, in the card's order, then those off. */
export const settingsRows = (s: Settings): { line: CardLine; isOn: boolean }[] => [
  ...s.cardLines.map(line => ({ line, isOn: true })),
  ...CARD_LINES.filter(l => !s.cardLines.includes(l)).map(line => ({ line, isOn: false })),
]

/** Off if on; on, at the end, if off. */
export const toggleLine = (s: Settings, line: CardLine): Settings =>
  normalizeSettings({ ...s, cardLines: s.cardLines.includes(line) ? s.cardLines.filter(l => l !== line) : [...s.cardLines, line] })

/** Swaps a line on with its neighbour above (-1) or below (1). */
export const moveLine = (s: Settings, line: CardLine, dir: -1 | 1): Settings => {
  const i = s.cardLines.indexOf(line)
  const j = i + dir
  if (i < 0 || j < 0 || j >= s.cardLines.length) return s
  const lines = [...s.cardLines]
  ;[lines[i], lines[j]] = [lines[j]!, lines[i]!]
  return normalizeSettings({ ...s, cardLines: lines })
}

export const resizeBars = (s: Settings, delta: number): Settings => normalizeSettings({ ...s, barWidth: s.barWidth + delta })

/** Beside the hint, or a row of its own under it. */
export const toggleLayout = (s: Settings): Settings => normalizeSettings({ ...s, hintLayout: s.hintLayout === 'inline' ? 'below' : 'inline' })
