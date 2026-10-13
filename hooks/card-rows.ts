// What the compact card says, line by line, as coloured parts; drawing is card.tsx's.
import type { Cell } from './bars'
import { burnBar, eighthBar, segmentBar } from './bars'
import { burnVerdict, computeBurn, contextTone, projectionText, projectionTone, WINDOW_MS } from './burn'
import { contextLabel, toSegments } from './context'
import { fmtUsd } from './format'
import { S } from './strings'
import type { CardLine, GitSnapshot, Live, RateLimit, Settings, UsageView } from '../types'

export type Part = { text: string; color?: string; bold?: boolean; dim?: boolean }
export type Row = { key: CardLine; parts: Part[] }

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

const WINDOW_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

/** One rate-limit window: a burn bar where its length and reset are known, else a plain gauge. */
export const quotaParts = (r: RateLimit, width: number, now: number, showUsed = false): Part[] => {
  const label: Part = { text: `${WINDOW_LABEL[r.kind] ?? r.kind} `, dim: true }
  const duration = WINDOW_MS[r.kind as keyof typeof WINDOW_MS]
  const resetsAt = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  const burn = duration && Number.isFinite(resetsAt) ? computeBurn(r.percentUsed, resetsAt, duration, now) : null
  if (!burn) {
    const color = contextTone(r.percentUsed)
    return [label, ...cellsToParts(eighthBar(r.percentUsed / 100, width, color)), { text: ` ${Math.round(r.percentUsed)}%`, color }]
  }
  const tone = projectionTone(burn)
  const used: Part[] = showUsed ? [{ text: ` ${Math.round(r.percentUsed)}%`, dim: true }] : []
  return [label, ...cellsToParts(burnBar(burn, width)), ...used, { text: ` ${projectionText(burn)} ${burnVerdict(burn)}`, color: tone }]
}

/** The context gauge: segments by category when the breakdown is in, else one tone. */
export const contextParts = (usage: UsageView, width: number): Part[] => {
  const label = contextLabel(usage.tokens, usage.window)
  const tone = label.pct === null ? 'inactive' : contextTone(label.pct)
  const bar =
    usage.breakdown && usage.tokens !== undefined
      ? segmentBar(toSegments(usage.breakdown, usage.tokens, usage.window), usage.window, width)
      : eighthBar(label.pct === null ? 0 : label.pct / 100, width, tone)
  return [{ text: `${S.ctx} `, dim: true }, ...cellsToParts(bar), { text: ` ${label.text}`, color: tone }]
}

type CardInput = { usage: UsageView | null; live: Live; git: GitSnapshot | null; settings: Settings; now: number }

/** The card's lines in the person's order; a line whose figure is unknown is left out. */
export const cardRows = ({ usage, live, git, settings, now }: CardInput): Row[] => {
  const rows: Row[] = []
  const width = settings.barWidth
  for (const key of settings.cardLines) {
    if (key === 'model' && live.model) {
      const model: Part = { text: prettyModel(live.model), color: 'claude', bold: true }
      rows.push({ key, parts: live.effort ? [model, { text: '  ' }, ...effortGauge(live.effort)] : [model] })
    } else if (key === 'context' && usage) {
      rows.push({ key, parts: contextParts(usage, width) })
    } else if ((key === 'five_hour' || key === 'seven_day') && usage) {
      const r = usage.rateLimits.find(l => l.kind === key)
      if (r) rows.push({ key, parts: quotaParts(r, width, now) })
    } else if (key === 'cost' && usage?.costUsd !== undefined) {
      rows.push({ key, parts: [{ text: fmtUsd(usage.costUsd), color: 'warning' }] })
    } else if (key === 'repo' && git?.branch) {
      rows.push({
        key,
        parts: [
          { text: ` ${git.branch}`, color: 'ide' },
          { text: ` +${git.added}`, color: 'diffAdded' },
          { text: ` −${git.removed}`, color: 'diffRemoved' },
        ],
      })
    }
  }
  return rows
}
