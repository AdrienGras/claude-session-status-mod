// The context window as segments, labels and the lists the pane unfolds.
import type { SessionContextBreakdown } from 'claude-code'

import { fmtTokens } from './format'
import type { BreakdownView, Segment } from '../types'

/**
 * The breakdown's categories as bar segments. The breakdown is an estimate: when the real total is
 * known, the used categories are scaled to it. The auto-compact buffer is reserved room, not used
 * tokens, so it keeps its size. Deferred rows are not in the window and are dropped; the free
 * segment is whatever the window has left.
 */
export const toSegments = (breakdown: Pick<BreakdownView, 'categories'>, tokens: number | undefined, window: number): Segment[] => {
  const used = breakdown.categories.filter(c => c.kind === 'used')
  const buffer = breakdown.categories.filter(c => c.kind === 'buffer')
  const estimate = used.reduce((a, c) => a + c.tokens, 0)
  const scale = tokens !== undefined && estimate > 0 ? tokens / estimate : 1
  const segments: Segment[] = [
    ...used.map(c => ({ label: c.name, tokens: c.tokens * scale, color: c.color, kind: 'used' as const })),
    ...buffer.map(c => ({ label: c.name, tokens: c.tokens, color: 'subtle', kind: 'buffer' as const })),
  ]
  const taken = segments.reduce((a, s) => a + s.tokens, 0)
  const free = breakdown.categories.find(c => c.kind === 'free')
  segments.push({ label: free?.name ?? 'Free space', tokens: Math.max(0, window - taken), color: 'subtle', kind: 'free' })
  return segments
}

/** `140k/1M 14%`, `≈22k/1M 2%` for an estimate; a dash with no figure at all. */
export const contextLabel = (tokens: number | undefined, window: number, isEstimate = false): { text: string; pct: number | null } => {
  if (tokens === undefined || window <= 0) return { text: '—', pct: null }
  const pct = Math.round((tokens / window) * 100)
  return { text: `${isEstimate ? '≈' : ''}${fmtTokens(tokens)}/${fmtTokens(window)} ${pct}%`, pct }
}

/**
 * The fill to show: the real one once a reply has measured it; before that, the breakdown's own
 * estimate of what the window holds (its used categories), marked as such; else nothing.
 */
export const contextFigure = (usage: { tokens?: number; breakdown: Pick<BreakdownView, 'categories'> | null }): { tokens?: number; isEstimate: boolean } => {
  if (usage.tokens !== undefined) return { tokens: usage.tokens, isEstimate: false }
  if (!usage.breakdown) return { isEstimate: false }
  const used = usage.breakdown.categories.filter(c => c.kind === 'used').reduce((a, c) => a + c.tokens, 0)
  return used > 0 ? { tokens: used, isEstimate: true } : { isEstimate: false }
}

export const mcpByServer = (tools: readonly { serverName: string; tokens: number }[]): { server: string; tokens: number; count: number }[] => {
  const by = new Map<string, { server: string; tokens: number; count: number }>()
  for (const t of tools) {
    const row = by.get(t.serverName) ?? { server: t.serverName, tokens: 0, count: 0 }
    row.tokens += t.tokens
    row.count += 1
    by.set(t.serverName, row)
  }
  return [...by.values()].sort((a, b) => b.tokens - a.tokens)
}

/** Tokens left before auto-compaction runs; null when either side is unknown. */
export const compactHeadroom = (tokens: number | undefined, threshold: number | undefined): number | null =>
  tokens === undefined || threshold === undefined ? null : Math.max(0, threshold - tokens)

/** Keep only what the drawings read; the grid and skill bodies stay with the engine. */
export const toBreakdownView = (b: SessionContextBreakdown): BreakdownView => ({
  categories: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
  memoryFiles: b.memoryFiles.map(f => ({ path: f.path, tokens: f.tokens })),
  // A deferred tool's schema loads on demand: until searched for, it is outside the window.
  mcpTools: b.mcpTools.filter(t => t.isLoaded).map(t => ({ name: t.name, serverName: t.serverName, tokens: t.tokens })),
  agents: b.agents.map(a => ({ agentType: a.agentType, tokens: a.tokens })),
  skills: b.skills && {
    totalSkills: b.skills.totalSkills,
    tokens: b.skills.tokens,
    items: b.skills.skillFrontmatter.map(k => ({ name: k.name, tokens: k.tokens })),
  },
  autoCompactThreshold: b.autoCompactThreshold,
  isAutoCompactEnabled: b.isAutoCompactEnabled,
  autocompactSource: b.autocompactSource,
})
