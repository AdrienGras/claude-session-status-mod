// The status line under the prompt: the person's items, one line, cut to the room it has.
import { lineBar, segmentBar, burnBar } from './bars'
import { contextTone, projectionText, projectionTone, readQuota } from './burn'
import { contextFigure, contextLabel, toSegments } from './context'
import { fmtUsd } from './format'
import { cellsToParts, prettyModel } from './parts'
import { S } from './strings'
import type { Part } from './parts'
import type { CardLine, GitSnapshot, Live, RateLimit, Settings, UsageView } from '../types'

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const SEP: Part = { text: ' │ ', color: 'subtle' }
const WINDOW_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

export type MinibarInput = { usage: UsageView | null; live: Live; git: GitSnapshot | null; settings: Settings; now: number }

const width = (parts: Part[]) => parts.reduce((a, p) => a + [...p.text].length, 0)

const model = (live: Live): Part[] | null => {
  if (!live.model) return null
  const parts: Part[] = [{ text: prettyModel(live.model), color: 'claude', bold: true }]
  const n = live.effort ? EFFORTS.indexOf(live.effort) + 1 : 0
  if (n > 0) parts.push({ text: ` ${'▮'.repeat(n)}${'▯'.repeat(EFFORTS.length - n)}`, color: 'claude' })
  return parts
}

const context = (usage: UsageView, w: number): Part[] => {
  const figure = contextFigure(usage)
  const label = contextLabel(figure.tokens, usage.window, figure.isEstimate)
  if (label.pct === null) return [{ text: `ctx ${S.ctxPending}`, dim: true }]
  const tone = figure.isEstimate ? 'inactive' : contextTone(label.pct)
  const bar = usage.breakdown
    ? segmentBar(toSegments(usage.breakdown, figure.tokens, usage.window), usage.window, w)
    : lineBar(label.pct / 100, w, tone)
  return [{ text: 'ctx ', dim: true }, ...cellsToParts(bar), { text: ` ${figure.isEstimate ? '≈' : ''}${label.pct}%`, color: tone }]
}

/** `5h ━━──┊──── 20% → 40% ✓`: the verdict as its glyph alone; a plain gauge without a reset time. */
const quota = (r: RateLimit, w: number, now: number): Part[] => {
  const label: Part = { text: `${WINDOW_LABEL[r.kind] ?? r.kind} `, dim: true }
  const used = `${Math.round(r.percentUsed)}%`
  const burn = readQuota(r, now)
  if (burn === 'stale') return [label, { text: '—', dim: true }]
  if (!burn) {
    const tone = contextTone(r.percentUsed)
    return [label, ...cellsToParts(lineBar(r.percentUsed / 100, w, tone)), { text: ` ${used}`, color: tone }]
  }
  const glyph = burn.usedPct >= 100 ? '⛔' : burn.marginMs >= 0 ? '✓' : '⚠'
  return [label, ...cellsToParts(burnBar(burn, w)), { text: ` ${used} ${projectionText(burn)} ${glyph}`, color: projectionTone(burn) }]
}

const item = (key: CardLine, { usage, live, git, settings, now }: MinibarInput): Part[] | null => {
  const w = settings.barWidth
  if (key === 'model') return model(live)
  if (key === 'context') return usage && context(usage, w)
  if (key === 'five_hour' || key === 'seven_day') {
    const r = usage?.rateLimits.find(l => l.kind === key)
    return r ? quota(r, w, now) : null
  }
  if (key === 'cost') return usage?.costUsd === undefined ? null : [{ text: fmtUsd(usage.costUsd), color: 'warning' }]
  if (!git?.branch) return null
  const branch: Part = { text: ` ${git.branch}`, color: 'ide' }
  if (git.added === null || git.removed === null) return [branch]
  return [branch, { text: ` +${git.added}`, color: 'diffAdded' }, { text: ` −${git.removed}`, color: 'diffRemoved' }]
}

/** The items in the person's order, separated by `│`; those past `maxCols` dropped from the right. */
export const minibarParts = (input: MinibarInput, maxCols: number): Part[] => {
  const out: Part[] = []
  for (const key of input.settings.cardLines) {
    const parts = item(key, input)
    if (!parts) continue
    const next = out.length ? [SEP, ...parts] : parts
    if (width(out) + width(next) > maxCols) break
    out.push(...next)
  }
  return out
}

/** Between the engine's hint and the status: never run into it. */
const LEAD: Part = { text: '  │ ', color: 'subtle' }
/** Columns kept for the line's padding and the open mark. */
const RESERVED = 6

/** The status as drawn after a hint `hintWidth` wide on a `columns`-wide row; empty when nothing fits. */
export const minibarLine = (input: MinibarInput, hintWidth: number, columns: number): Part[] => {
  const parts = minibarParts(input, columns - hintWidth - RESERVED - width([LEAD]))
  return parts.length ? [LEAD, ...parts] : []
}

/** The status on a row of its own, under the engine's hint: the whole row, no lead. */
export const minibarRow = (input: MinibarInput, columns: number): Part[] => minibarParts(input, columns - RESERVED)
