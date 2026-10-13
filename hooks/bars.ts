// Text bars, one Cell per terminal column, coloured by theme keys.
import type { Burn } from './burn'
import { projectionTone } from './burn'
import type { Segment } from '../types'

export type Cell = { text: string; color?: string; role: 'fill' | 'marker' | 'empty' }

const PARTIALS = '▏▎▍▌▋▊▉' // 1/8 .. 7/8
const FULL = '█'
const MARKER = '┊'
const EMPTY: Cell = { text: ' ', role: 'empty' }

/** `fraction` of `width` filled to the eighth of a cell; the rest blank. */
export const eighthBar = (fraction: number, width: number, color: string): Cell[] => {
  const exact = Math.min(1, Math.max(0, fraction)) * width
  const full = Math.floor(exact)
  const step = Math.floor((exact - full) * 8)
  return Array.from({ length: width }, (_, i): Cell => {
    if (i < full) return { text: FULL, color, role: 'fill' }
    if (i === full && step > 0) return { text: PARTIALS[step - 1]!, color, role: 'fill' }
    return EMPTY
  })
}

/** The used share, plus `┊` where the elapsed time says usage should be. */
export const burnBar = (b: Burn, width: number): Cell[] => {
  const cells = eighthBar(b.usedPct / 100, width, projectionTone(b))
  const at = Math.min(width - 1, Math.floor(Math.min(1, Math.max(0, b.elapsedFrac)) * width))
  cells[at] = { text: MARKER, color: 'text', role: 'marker' }
  return cells
}

/**
 * Each segment gets whole cells in proportion to its tokens (a cell carries one colour), shared by
 * largest remainder so the bar always spans `width`. Free space is left blank.
 */
export const segmentBar = (segments: readonly Segment[], total: number, width: number): Cell[] => {
  if (total <= 0 || segments.length === 0) return Array.from({ length: width }, () => EMPTY)
  const exact = segments.map(s => (Math.max(0, s.tokens) / total) * width)
  const counts = exact.map(Math.floor)
  let left = width - counts.reduce((a, b) => a + b, 0)
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    counts[i] = (counts[i] ?? 0) + 1
    left -= 1
  }
  const cells: Cell[] = []
  segments.forEach((s, i) => {
    for (let n = 0; n < (counts[i] ?? 0); n++) cells.push(s.kind === 'free' ? EMPTY : { text: FULL, color: s.color, role: 'fill' })
  })
  while (cells.length < width) cells.push(EMPTY)
  return cells.slice(0, width)
}
