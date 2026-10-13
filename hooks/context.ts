// The context window as segments, labels and the lists the pane unfolds.
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

/** `140k/1M 14%`; a dash before the first reading. */
export const contextLabel = (tokens: number | undefined, window: number): { text: string; pct: number | null } => {
  if (tokens === undefined || window <= 0) return { text: '—', pct: null }
  const pct = Math.round((tokens / window) * 100)
  return { text: `${fmtTokens(tokens)}/${fmtTokens(window)} ${pct}%`, pct }
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
