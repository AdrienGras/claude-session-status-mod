// The side pane, laid out: one framed box per section, every row exactly the pane's width.
// pane.tsx only draws these rows and wires the buttons.
import { burnBar, lineBar, segmentBar } from './bars'
import { burnVerdict, computeBurn, contextTone, projectionText, projectionTone, WINDOW_MS } from './burn'
import { compactHeadroom, contextFigure, contextLabel, mcpByServer, toSegments } from './context'
import { fmtDur, fmtTokens, fmtUsd, fmtWhen } from './format'
import { cellsToParts, effortGauge, prettyModel } from './parts'
import type { Part } from './parts'
import { costRates } from './session'
import { S } from './strings'
import type { Counters, GitSnapshot, Live, RateLimit, Receipt, Settings, UsageView } from '../types'

export type GroupKey = 'memory' | 'mcp' | 'skills' | 'agents'

/** A drawn row: text, or a row of unfoldable lists, each a button of its own. */
export type PaneRow =
  | { kind: 'text'; parts: Part[] }
  | { kind: 'groups'; lead: Part[]; groups: { key: GroupKey; parts: Part[] }[]; tail: Part[] }

export type PaneInput = {
  usage: UsageView | null
  live: Live
  counters: Counters
  receipt: Receipt | null
  git: GitSnapshot | null
  settings: Settings
  expanded: readonly string[]
  now: number
  columns: number
}

/** A row's content: a left side, and a right side pushed to the box's right edge. */
type Row = { left: Part[]; right?: Part[] }
type Group = { key: GroupKey; summary: string; items: Row[] }
type Section = { title: Part[]; aside: Part[]; rows: Row[]; groups: Group[] }

const LEGEND_SIZE = 4
const MAX_FILES = 10
const MAX_TOOLS = 5
/** `│ ` and ` │` around a row's content. */
const FRAME = 4

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const dim = (text: string): Part => ({ text, dim: true })
const border = (text: string): Part => ({ text, color: 'subtle' })
const len = (parts: readonly Part[]) => parts.reduce((a, p) => a + [...p.text].length, 0)

/** Seconds under a minute, else the compact duration. */
const fmtSpan = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : fmtDur(ms))

/** A line cut at `columns`, its last visible character an ellipsis. */
export const fitLine = (line: readonly Part[], columns: number): Part[] => {
  if (len(line) <= columns) return [...line]
  const out: Part[] = []
  let used = 0
  for (const p of line) {
    const chars = [...p.text]
    if (used + chars.length < columns) {
      out.push(p)
      used += chars.length
      continue
    }
    out.push({ ...p, text: `${chars.slice(0, Math.max(0, columns - used - 1)).join('')}…` })
    break
  }
  return out
}

/** Exactly `width` columns: cut, or padded with spaces. */
const pad = (parts: readonly Part[], width: number): Part[] => {
  const fitted = fitLine(parts, width)
  const gap = width - len(fitted)
  return gap > 0 ? [...fitted, { text: ' '.repeat(gap) }] : fitted
}

/** Left and right sides `width` apart; when they do not both fit, one line cut at the end. */
const spread = ({ left, right = [] }: Row, width: number): Part[] => {
  if (right.length === 0) return pad(left, width)
  const gap = width - len(left) - len(right)
  return gap >= 1 ? [...left, { text: ' '.repeat(gap) }, ...right] : pad([...left, { text: ' ' }, ...right], width)
}

/** A path cut from its start, so the end that names the file stays. */
const tail = (path: string, max: number) => {
  const chars = [...path]
  return chars.length <= max ? path : `…${chars.slice(chars.length - max + 1).join('')}`
}

/** `╭─ Title ───────── aside ─╮`, exactly `columns` wide. */
const frameTop = (title: Part[], aside: Part[], columns: number): Part[] => {
  // `╭─ ` + title + ` ` + fill + (` ` + aside + ` `) + `─╮`
  const asideWidth = aside.length ? len(aside) + 2 : 0
  const head = fitLine(title, Math.max(1, columns - 8 - asideWidth))
  const fill = Math.max(1, columns - 6 - len(head) - asideWidth)
  const end = aside.length ? [{ text: ' ' }, ...aside, border(' ─╮')] : [border('─╮')]
  const row = [border('╭─ '), ...head, border(` ${'─'.repeat(fill)}`), ...end]
  return len(row) === columns ? row : pad(row, columns)
}

const frameRow = (row: Row, columns: number): PaneRow => ({
  kind: 'text',
  parts: [border('│ '), ...spread(row, columns - FRAME), border(' │')],
})

const frameBottom = (columns: number): PaneRow => ({ kind: 'text', parts: [border(`╰${'─'.repeat(columns - 2)}╯`)] })

/** The lists two to a row, each its own button, then the open ones' items under them. */
const frameGroups = (groups: Group[], expanded: readonly string[], columns: number): PaneRow[] => {
  const inner = columns - FRAME
  const half = Math.floor((inner - 1) / 2)
  const out: PaneRow[] = []
  for (let i = 0; i < groups.length; i += 2) {
    const pair = groups.slice(i, i + 2)
    const cells = pair.map((g, k) => {
      const isOpen = expanded.includes(g.key)
      const width = k === 0 ? half : inner - half - 1
      return { key: g.key, parts: pad([{ text: `${isOpen ? '▾' : '▸'} ${g.summary}` }], width) }
    })
    if (cells.length === 2) cells[0]!.parts.push({ text: ' ' })
    const used = cells.reduce((a, c) => a + len(c.parts), 0)
    out.push({ kind: 'groups', lead: [border('│ ')], groups: cells, tail: [{ text: ' '.repeat(Math.max(0, inner - used)) }, border(' │')] })
    for (const g of pair) if (expanded.includes(g.key)) for (const item of g.items) out.push(frameRow(item, columns))
  }
  return out
}

const header = ({ usage, live }: PaneInput): Section => {
  const rows: Row[] = []
  const state: Part = live.isWorking ? { text: `● ${S.working}`, color: 'claude' } : dim(`○ ${S.idle}`)
  const facts = [live.permissionMode ? `${S.mode} ${live.permissionMode}` : null, `${live.requests} ${S.req}`].filter(Boolean).join(' · ')
  rows.push({ left: live.effort ? effortGauge(live.effort) : [], right: [dim(facts)] })
  const speed = live.speed
    ? `ttft ${(live.speed.ttftMs / 1000).toFixed(1)}s${live.speed.tokPerS === null ? '' : ` · ${Math.round(live.speed.tokPerS)} tok/s`}`
    : ''
  if (speed || usage) rows.push({ left: [dim(speed)], right: usage ? [dim(`${S.window} ${fmtTokens(usage.window)}`)] : [] })
  const title: Part = { text: live.model ? prettyModel(live.model) : S.model, color: 'claude', bold: true }
  return { title: [title], aside: [state], rows, groups: [] }
}

const context = (usage: UsageView, columns: number): Section => {
  const b = usage.breakdown
  const figure = contextFigure(usage)
  const label = contextLabel(figure.tokens, usage.window, figure.isEstimate)
  const tone = label.pct === null || figure.isEstimate ? 'inactive' : contextTone(label.pct)
  const inner = columns - FRAME
  const rows: Row[] = []
  const groups: Group[] = []
  if (label.pct === null) rows.push({ left: [dim(S.ctxFillsLater)] })
  else if (figure.isEstimate) rows.push({ left: [dim(S.ctxEstimate)] })
  if (b && figure.tokens !== undefined) {
    const segments = toSegments(b, figure.tokens, usage.window)
    rows.push({ left: cellsToParts(segmentBar(segments, usage.window, inner)) })
    const used = segments.filter(s => s.kind === 'used' && Math.round(s.tokens) > 0).sort((x, y) => y.tokens - x.tokens)
    for (const s of used.slice(0, LEGEND_SIZE)) rows.push({ left: [{ text: '■ ', color: s.color }, { text: s.label }], right: [dim(fmtTokens(s.tokens))] })
    const rest = used.slice(LEGEND_SIZE).reduce((a, s) => a + s.tokens, 0)
    if (rest > 0) rows.push({ left: [dim(`■ ${S.other}`)], right: [dim(fmtTokens(rest))] })
  } else if (label.pct !== null) {
    rows.push({ left: cellsToParts(lineBar(label.pct / 100, inner, tone)) })
  }
  if (b) {
    if (!b.isAutoCompactEnabled) rows.push({ left: [dim(S.autoCompactOff)] })
    else {
      const room = compactHeadroom(usage.tokens, b.autoCompactThreshold)
      if (room !== null) rows.push({ left: [dim(S.autoCompactIn)], right: [dim(fmtTokens(room))] })
    }
    const sum = (xs: { tokens: number }[]) => fmtTokens(xs.reduce((a, x) => a + x.tokens, 0))
    const servers = mcpByServer(b.mcpTools)
    const item = (name: string, tokens: number): Row => ({ left: [{ text: `  ${name}` }], right: [dim(fmtTokens(tokens))] })
    groups.push(
      { key: 'memory', summary: `${S.memory} ${b.memoryFiles.length} · ${sum(b.memoryFiles)}`, items: b.memoryFiles.map(f => item(tail(f.path, inner - 10), f.tokens)) },
      { key: 'mcp', summary: `MCP ${servers.length} · ${sum(b.mcpTools)}`, items: servers.map(s => item(`${s.server} (${s.count})`, s.tokens)) },
      { key: 'skills', summary: `${S.skills} ${b.skills?.totalSkills ?? 0} · ${fmtTokens(b.skills?.tokens ?? 0)}`, items: [] },
      { key: 'agents', summary: `${S.agents} ${b.agents.length}`, items: b.agents.map(a => item(a.agentType, a.tokens)) },
    )
  }
  const isEstimate = b !== null && usage.breakdownDetail === 'summary'
  return {
    title: [{ text: isEstimate ? `${S.context} ≈` : S.context, color: 'claude', bold: true }],
    aside: [{ text: label.text, color: tone }],
    rows,
    groups,
  }
}

const quotaRows = (r: RateLimit, width: number, now: number): Row[] => {
  const when = (at: number) => `${S.resets} ${fmtWhen(at, now)}`
  const label = dim(`${r.kind === 'five_hour' ? '5h' : r.kind === 'seven_day' ? '7d' : r.kind} `)
  const duration = WINDOW_MS[r.kind as keyof typeof WINDOW_MS]
  const resetsAt = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  const burn = duration && Number.isFinite(resetsAt) ? computeBurn(r.percentUsed, resetsAt, duration, now) : null
  if (!burn) {
    const tone = contextTone(r.percentUsed)
    const rows: Row[] = [
      { left: [label, ...cellsToParts(lineBar(r.percentUsed / 100, width, tone))], right: [{ text: `${Math.round(r.percentUsed)}%`, color: tone }] },
    ]
    if (Number.isFinite(resetsAt)) rows.push({ left: [dim(`   ${when(resetsAt)}`)] })
    return rows
  }
  return [
    {
      left: [label, ...cellsToParts(burnBar(burn, width)), dim(` ${Math.round(r.percentUsed)}%`)],
      right: [{ text: `${projectionText(burn)} ${burnVerdict(burn)}`, color: projectionTone(burn) }],
    },
    { left: [dim(`   ⧗${fmtDur(burn.remainingMs)} · ${when(resetsAt)}`)] },
  ]
}

const quotas = (usage: UsageView, input: PaneInput): Section | null => {
  if (usage.rateLimits.length === 0) return null
  // Room for the label, the used share and a verdict as long as `→ ~>999% ⚠ wall 23h59`.
  const width = Math.max(4, Math.min(input.settings.barWidth, input.columns - FRAME - 30))
  return {
    title: [{ text: S.quotas, color: 'claude', bold: true }],
    aside: [],
    rows: usage.rateLimits.flatMap(r => quotaRows(r, width, input.now)),
    groups: [],
  }
}

const session = ({ usage, counters, receipt, now }: PaneInput): Section => {
  const rows: Row[] = []
  if (usage) {
    const rates = costRates(usage.costUsd, usage.startedAt, now, usage.prompts)
    const rateText = [rates.perHour === null ? null : `${fmtUsd(rates.perHour)}/h`, rates.perPrompt === null ? null : `${fmtUsd(rates.perPrompt)}/${S.prompt}`]
      .filter(Boolean)
      .join(' · ')
    rows.push({ left: [dim(rateText)], right: [dim(`${fmtDur(now - usage.startedAt)} · ${plural(usage.prompts, S.prompt)}`)] })
  }
  rows.push({ left: [dim(S.sinceOpen)], right: [dim(`${plural(counters.compactions, S.compaction)} · ${plural(counters.subagents, S.subagent)}`)] })
  const tools = Object.entries(counters.tools).sort((a, b) => b[1] - a[1])
  if (tools.length > 0) {
    const shown = tools.slice(0, MAX_TOOLS).map(([name, n]) => `${name} ${n}`).join(' · ')
    rows.push({ left: [dim(`${shown}${tools.length > MAX_TOOLS ? ` · +${tools.length - MAX_TOOLS} ${S.more}` : ''}`)] })
  }
  if (receipt?.isRunning) rows.push({ left: [{ text: `${S.turnRunning} ${fmtSpan(now - receipt.startedAt)}`, color: 'claude' }] })
  else if (receipt) {
    rows.push({
      left: [{ text: `${S.lastTurn} ${fmtSpan(receipt.durationMs ?? 0)}` }],
      right: receipt.costAddedUsd === null ? [] : [{ text: `+${fmtUsd(receipt.costAddedUsd)}`, color: 'warning' }],
    })
    const counts = [plural(receipt.agents, S.agent), plural(receipt.edits, S.edit), plural(receipt.errors, S.error)].join(' · ')
    rows.push({ left: [receipt.errors > 0 ? { text: `  ${counts}`, color: 'error' } : dim(`  ${counts}`)] })
  }
  const cost = usage?.costUsd
  return { title: [{ text: S.session, color: 'claude', bold: true }], aside: cost === undefined ? [] : [{ text: fmtUsd(cost), color: 'warning' }], rows, groups: [] }
}

const repo = ({ git, columns }: PaneInput): Section | null => {
  if (!git) return null
  const inner = columns - FRAME
  const rows: Row[] = [{ left: [dim(tail(git.cwd, inner))] }]
  if (git.repo || git.branch) {
    const diff: Part[] = git.branch
      ? [
          { text: `+${git.added}`, color: 'diffAdded' },
          { text: ` −${git.removed}`, color: 'diffRemoved' },
          dim(` · ${plural(git.files, S.file)}${git.ahead !== null && git.behind !== null ? ` · ↑${git.ahead} ↓${git.behind}` : ''}`),
        ]
      : []
    const name: Part[] = git.repo ? [{ text: git.repo }] : []
    // A long name would cut the diff: then each gets a row.
    if (name.length && diff.length && len(name) + len(diff) + 1 > inner) rows.push({ left: name }, { left: [], right: diff })
    else rows.push({ left: name, right: diff })
  }
  if (git.sessionFiles.length > 0) {
    rows.push({ left: [dim(`${S.thisSession}:`)] })
    for (const f of git.sessionFiles.slice(0, MAX_FILES)) rows.push({ left: [{ text: `  ${tail(f, inner - 2)}` }] })
    if (git.sessionFiles.length > MAX_FILES) rows.push({ left: [dim(`  +${git.sessionFiles.length - MAX_FILES} ${S.more}`)] })
  }
  return {
    title: [{ text: S.repo, color: 'claude', bold: true }],
    aside: git.branch ? [{ text: ` ${git.branch}`, color: 'ide' }] : [],
    rows,
    groups: [],
  }
}

/** The pane's boxes in order, each framed; a section with nothing to say is left out. */
export const paneRows = (input: PaneInput): PaneRow[] => {
  const sections = [
    header(input),
    input.usage && context(input.usage, input.columns),
    input.usage && quotas(input.usage, input),
    session(input),
    repo(input),
  ].filter((s): s is Section => s !== null)
  return sections.flatMap(s => [
    { kind: 'text' as const, parts: frameTop(s.title, s.aside, input.columns) },
    ...s.rows.map(r => frameRow(r, input.columns)),
    ...frameGroups(s.groups, input.expanded, input.columns),
    frameBottom(input.columns),
  ])
}
