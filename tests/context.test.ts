import type { SessionContextBreakdown } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { compactHeadroom, contextLabel, mcpByServer, toSegments } from '../hooks/context'

const cat = (name: string, tokens: number, kind: 'used' | 'free' | 'buffer' | 'deferred', color = 'claude') =>
  ({ name, tokens, color, kind, isDeferred: kind === 'deferred' })

const breakdown = {
  categories: [
    cat('System prompt', 6_000, 'used', 'promptBorder'),
    cat('Messages', 90_000, 'used', 'purple_FOR_SUBAGENTS_ONLY'),
    cat('MCP tools (deferred)', 3_000, 'deferred', 'inactive'),
    cat('Autocompact buffer', 45_000, 'buffer', 'inactive'),
    cat('Free space', 859_000, 'free', 'promptBorder'),
  ],
  mcpTools: [],
} as unknown as SessionContextBreakdown

const sum = (xs: { tokens: number }[]) => xs.reduce((a, b) => a + b.tokens, 0)

test('used categories scale to the real total; deferred dropped; free fills the window', () => {
  const segs = toSegments(breakdown, 140_000, 1_000_000)
  expect(segs.some(s => s.label.includes('deferred'))).toBe(false)
  expect(Math.round(sum(segs.filter(s => s.kind === 'used')))).toBe(140_000)
  expect(segs.find(s => s.kind === 'buffer')?.tokens).toBe(45_000)
  expect(segs.find(s => s.kind === 'buffer')?.color).toBe('subtle')
  expect(Math.round(segs.find(s => s.kind === 'free')!.tokens)).toBe(815_000)
  expect(Math.round(sum(segs))).toBe(1_000_000)
  expect(segs[1]?.color).toBe('purple_FOR_SUBAGENTS_ONLY')
})

test('without a real total the estimate stands as it is', () => {
  const segs = toSegments(breakdown, undefined, 1_000_000)
  expect(sum(segs.filter(s => s.kind === 'used'))).toBe(96_000)
})

test('the label reads tokens over window, or a dash before any reading', () => {
  expect(contextLabel(140_000, 1_000_000)).toEqual({ text: '140k/1M 14%', pct: 14 })
  expect(contextLabel(undefined, 1_000_000)).toEqual({ text: '—', pct: null })
  expect(contextLabel(1_120_000, 1_000_000)).toEqual({ text: '1.1M/1M 112%', pct: 112 })
})

test('MCP tools group by server, heaviest first', () => {
  const tools = [
    { name: 'a', serverName: 'github', tokens: 100, isLoaded: true },
    { name: 'b', serverName: 'slack', tokens: 500, isLoaded: true },
    { name: 'c', serverName: 'github', tokens: 700, isLoaded: true },
  ]
  expect(mcpByServer(tools)).toEqual([
    { server: 'github', tokens: 800, count: 2 },
    { server: 'slack', tokens: 500, count: 1 },
  ])
})

test('headroom before auto-compaction', () => {
  expect(compactHeadroom(140_000, 160_000)).toBe(20_000)
  expect(compactHeadroom(140_000, undefined)).toBe(null)
  expect(compactHeadroom(undefined, 160_000)).toBe(null)
  expect(compactHeadroom(170_000, 160_000)).toBe(0)
})
