// What the side pane says, section by section, as coloured parts; drawing is pane.tsx's.
import { contextParts, effortGauge, prettyModel, quotaParts } from './card-rows'
import type { Part } from './card-rows'
import { compactHeadroom, mcpByServer, toSegments } from './context'
import { fmtClock, fmtDur, fmtTokens, fmtUsd } from './format'
import { costRates } from './session'
import { S } from './strings'
import type { Counters, GitSnapshot, Live, Receipt, Settings, UsageView } from '../types'
import { WINDOW_MS } from './burn'

export type Line = Part[]
export type GroupKey = 'memory' | 'mcp' | 'skills' | 'agents'
export type Group = { key: GroupKey; summary: Line; items: Line[]; isOpen: boolean }
export type SectionKey = 'header' | 'context' | 'quotas' | 'session' | 'repo'
export type Section = { key: SectionKey; title: string; lines: Line[]; groups: Group[] }

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

const MAX_FILES = 10
const MAX_TOOLS = 5

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const dim = (text: string): Part => ({ text, dim: true })
const sep = dim(' · ')

/** Seconds under a minute, else the compact duration. */
const fmtSpan = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : fmtDur(ms))

/** A line cut at `columns`, its last visible character an ellipsis. */
export const fitLine = (line: Line, columns: number): Line => {
  const out: Line = []
  let used = 0
  const total = line.reduce((a, p) => a + [...p.text].length, 0)
  if (total <= columns) return line
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

/** A path cut from its start, so the end that names the file stays. */
const tail = (path: string, max: number) => {
  const chars = [...path]
  return chars.length <= max ? path : `…${chars.slice(chars.length - max + 1).join('')}`
}

const header = ({ usage, live }: PaneInput): Section => {
  const lines: Line[] = []
  if (live.model) {
    const model: Part = { text: prettyModel(live.model), color: 'claude', bold: true }
    lines.push(live.effort ? [model, { text: '  ' }, ...effortGauge(live.effort)] : [model])
  }
  const state: Line = []
  if (live.permissionMode) state.push(dim(`${S.mode} `), { text: live.permissionMode }, { text: '  ' })
  state.push(live.isWorking ? { text: `● ${S.working}`, color: 'claude' } : dim(`○ ${S.idle}`))
  state.push({ text: '  ' }, dim(`${live.requests} ${S.req}`))
  lines.push(state)
  if (live.speed) {
    const { ttftMs, tokPerS } = live.speed
    lines.push([dim(`ttft ${(ttftMs / 1000).toFixed(1)}s${tokPerS === null ? '' : ` · ${Math.round(tokPerS)} tok/s`}`)])
  }
  if (usage) {
    const source = usage.breakdown?.autocompactSource
    lines.push([dim(`${S.window} ${fmtTokens(usage.window)}${source ? ` (${source})` : ''}`)])
  }
  return { key: 'header', title: S.model, lines, groups: [] }
}

const group = (key: GroupKey, expanded: readonly string[], summary: string, items: Line[]): Group => {
  const isOpen = expanded.includes(key)
  return { key, summary: [{ text: `${isOpen ? '▾' : '▸'} ${summary}` }], items: isOpen ? items : [], isOpen }
}

const context = (input: PaneInput, usage: UsageView, width: number): Section => {
  const b = usage.breakdown
  const lines: Line[] = [contextParts(usage, width)]
  const groups: Group[] = []
  if (b) {
    for (const s of toSegments(b, usage.tokens, usage.window)) {
      lines.push(
        s.kind === 'free'
          ? [dim(`□ ${s.label} ${fmtTokens(s.tokens)}`)]
          : [{ text: '■ ', color: s.color }, { text: s.label }, dim(` ${fmtTokens(s.tokens)}`)],
      )
    }
    if (!b.isAutoCompactEnabled) lines.push([dim(S.autoCompactOff)])
    else {
      const room = compactHeadroom(usage.tokens, b.autoCompactThreshold)
      if (room !== null) lines.push([dim(`${S.autoCompactIn} ${fmtTokens(room)}`)])
    }
    const sum = (xs: { tokens: number }[]) => fmtTokens(xs.reduce((a, x) => a + x.tokens, 0))
    const servers = mcpByServer(b.mcpTools)
    const items = (rows: { name: string; tokens: number }[]) => rows.map(r => [{ text: `  ${r.name}` }, dim(` ${fmtTokens(r.tokens)}`)])
    groups.push(
      group('memory', input.expanded, `${plural(b.memoryFiles.length, S.memoryFile)} · ${sum(b.memoryFiles)}`,
        items(b.memoryFiles.map(f => ({ name: tail(f.path, input.columns - 8), tokens: f.tokens })))),
      group('mcp', input.expanded, `${plural(servers.length, S.mcpServer)} · ${plural(b.mcpTools.length, S.tool)} · ${sum(b.mcpTools)}`,
        items(servers.map(s => ({ name: `${s.server} (${s.count})`, tokens: s.tokens })))),
      group('skills', input.expanded, `${plural(b.skills?.totalSkills ?? 0, S.skill)} · ${fmtTokens(b.skills?.tokens ?? 0)}`, []),
      group('agents', input.expanded, `${plural(b.agents.length, S.agent)} · ${sum(b.agents)}`,
        items(b.agents.map(a => ({ name: a.agentType, tokens: a.tokens })))),
    )
  }
  const isEstimate = b !== null && usage.breakdownDetail === 'summary'
  return { key: 'context', title: isEstimate ? `${S.context} ≈` : S.context, lines, groups }
}

const quotas = (usage: UsageView, width: number, now: number): Section | null => {
  if (usage.rateLimits.length === 0) return null
  const lines: Line[] = []
  for (const r of usage.rateLimits) {
    lines.push(quotaParts(r, width, now, true))
    const resetsAt = r.resetsAt ? Date.parse(r.resetsAt) : NaN
    if (Number.isFinite(resetsAt)) {
      const left = r.kind in WINDOW_MS ? `⧗${fmtDur(Math.max(0, resetsAt - now))} · ` : ''
      lines.push([dim(`   ${left}${S.resets} ${fmtClock(resetsAt)}`)])
    }
  }
  return { key: 'quotas', title: S.quotas, lines, groups: [] }
}

const session = ({ usage, counters, receipt, now }: PaneInput): Section => {
  const lines: Line[] = []
  if (usage) {
    const rates = costRates(usage.costUsd, usage.startedAt, now, usage.prompts)
    if (usage.costUsd !== undefined) {
      const cost: Line = [{ text: fmtUsd(usage.costUsd), color: 'warning' }]
      if (rates.perHour !== null) cost.push(sep, dim(`${fmtUsd(rates.perHour)}/h`))
      if (rates.perPrompt !== null) cost.push(sep, dim(`${fmtUsd(rates.perPrompt)}/${S.prompt}`))
      lines.push(cost)
    }
    lines.push([dim(`${fmtDur(now - usage.startedAt)} · ${plural(usage.prompts, S.prompt)}`)])
  }
  lines.push([dim(`${S.sinceOpen}: ${plural(counters.compactions, S.compaction)} · ${plural(counters.subagents, S.subagent)}`)])
  const tools = Object.entries(counters.tools).sort((a, b) => b[1] - a[1])
  if (tools.length > 0) {
    const shown = tools.slice(0, MAX_TOOLS).map(([name, n]) => `${name} ${n}`).join(' · ')
    const more = tools.length > MAX_TOOLS ? ` · +${tools.length - MAX_TOOLS} ${S.more}` : ''
    lines.push([dim(`${shown}${more}`)])
  }
  if (receipt?.isRunning) lines.push([{ text: `${S.turnRunning} ${fmtSpan(now - receipt.startedAt)}`, color: 'claude' }])
  else if (receipt) {
    const head: Line = [{ text: `${S.lastTurn} ${fmtSpan(receipt.durationMs ?? 0)}` }]
    if (receipt.costAddedUsd !== null) head.push(sep, { text: `+${fmtUsd(receipt.costAddedUsd)}`, color: 'warning' })
    lines.push(head)
    const counts = [plural(receipt.agents, S.agent), plural(receipt.edits, S.edit), plural(receipt.errors, S.error)].join(' · ')
    lines.push([{ text: `  ${counts}`, color: receipt.errors > 0 ? 'error' : undefined, dim: receipt.errors === 0 }])
  }
  return { key: 'session', title: S.session, lines, groups: [] }
}

const repo = ({ git, columns }: PaneInput): Section | null => {
  if (!git) return null
  const lines: Line[] = [[dim(tail(git.cwd, columns))]]
  if (git.repo) lines.push([{ text: git.repo }])
  if (git.branch) {
    const line: Line = [
      { text: ` ${git.branch}`, color: 'ide' },
      { text: ` +${git.added}`, color: 'diffAdded' },
      { text: ` −${git.removed}`, color: 'diffRemoved' },
      sep,
      dim(plural(git.files, S.file)),
    ]
    if (git.ahead !== null && git.behind !== null) line.push(sep, dim(`↑${git.ahead} ↓${git.behind}`))
    lines.push(line)
  }
  if (git.sessionFiles.length > 0) {
    lines.push([dim(`${S.thisSession}:`)])
    for (const f of git.sessionFiles.slice(0, MAX_FILES)) lines.push([{ text: `  ${tail(f, columns - 2)}` }])
    if (git.sessionFiles.length > MAX_FILES) lines.push([dim(`  +${git.sessionFiles.length - MAX_FILES} ${S.more}`)])
  }
  return { key: 'repo', title: S.repo, lines, groups: [] }
}

/** The pane's sections in order; one with nothing to say is left out. */
export const paneSections = (input: PaneInput): Section[] => {
  const width = Math.max(4, Math.min(input.settings.barWidth, input.columns - 22))
  const sections: (Section | null)[] = [
    header(input),
    input.usage && context(input, input.usage, width),
    input.usage && quotas(input.usage, width, input.now),
    session(input),
    repo(input),
  ]
  return sections
    .filter((s): s is Section => s !== null)
    .map(s => ({
      ...s,
      lines: s.lines.map(l => fitLine(l, input.columns)),
      groups: s.groups.map(g => ({ ...g, summary: fitLine(g.summary, input.columns), items: g.items.map(l => fitLine(l, input.columns)) })),
    }))
}
