// Coloured parts shared by the status line under the prompt and the side pane.
import type { Cell } from './bars'
import { S } from './strings'

export type Part = { text: string; color?: string; bold?: boolean; dim?: boolean }

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** `claude-opus-5-5` → `Opus 5.5`; a dated or `[1m]` id the same; a display name as it is. */
export const prettyModel = (id: string): string => {
  const m = id.replace(/\[.*\]$/, '').match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/)
  if (!m) return id
  const family = m[1]!
  return `${family[0]!.toUpperCase()}${family.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

/** `effort ▮▮▮▯▯ high`; a level it does not know, as a word alone. */
export const effortGauge = (effort: string): Part[] => {
  const n = EFFORTS.indexOf(effort) + 1
  const label: Part = { text: `${S.effort} `, dim: true }
  if (n === 0) return [label, { text: effort, color: 'claude' }]
  return [label, { text: '▮'.repeat(n) + '▯'.repeat(EFFORTS.length - n), color: 'claude' }, { text: ` ${effort}`, color: 'claude' }]
}

/** Cells as parts, consecutive cells of one colour merged. */
export const cellsToParts = (cells: readonly Cell[]): Part[] =>
  cells.reduce<Part[]>((parts, c) => {
    const last = parts[parts.length - 1]
    if (last && last.color === c.color) last.text += c.text
    else parts.push({ text: c.text, color: c.color })
    return parts
  }, [])
