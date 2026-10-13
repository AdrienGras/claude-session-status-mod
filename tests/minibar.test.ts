import { expect, test } from 'claude-code/testing'

import { cellWidth } from '../hooks/cells'
import { minibarLine, minibarParts, minibarRow } from '../hooks/minibar-rows'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { EMPTY_LIVE } from '../hooks/state'
import type { UsageView } from '../types'

const NOW = 1_000_000_000
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

const usage: UsageView = {
  startedAt: 0,
  tokens: 140_000,
  window: 1_000_000,
  rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(NOW + 2.5 * H) }],
  costUsd: 4.82,
  prompts: 12,
  breakdown: null,
  breakdownDetail: 'summary',
}
const live = { ...EMPTY_LIVE, model: 'claude-opus-5-5', effort: 'high' }
const text = (parts: { text: string }[]) => parts.map(p => p.text).join('')
const bar = (over: Partial<Parameters<typeof minibarParts>[0]> = {}, cols = 200) =>
  text(minibarParts({ usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW, ...over }, cols))

test('the default line: model and effort, context, the 5h window', () => {
  const t = bar()
  expect(t.startsWith('Opus 5.5 ▮▮▮▯▯ │ ctx ')).toBe(true)
  expect(t).toContain(' 14% │ 5h ')
  expect(t.endsWith(' 20% → 40% ✓')).toBe(true)
})

test('cost shows when asked for', () => {
  expect(bar({ settings: { ...DEFAULT_SETTINGS, cardLines: ['model', 'cost'] } })).toBe('Opus 5.5 ▮▮▮▯▯ │ $4.82')
})

test('no rate limits: no quota item', () => {
  expect(bar({ usage: { ...usage, rateLimits: [] } })).not.toContain('5h')
})

test('before the first reply the context is the estimate, marked', () => {
  const breakdown = {
    categories: [{ name: 'System prompt', tokens: 20_000, color: 'promptBorder', kind: 'used' as const }],
    memoryFiles: [], mcpTools: [], agents: [], isAutoCompactEnabled: true, autocompactSource: 'model-default',
  }
  const t = bar({ usage: { ...usage, tokens: undefined, breakdown } })
  expect(t).toContain('ctx ')
  expect(t).toContain(' ≈2%')
})

test('with no figure at all the context says when it comes, never 0%', () => {
  const t = bar({ usage: { ...usage, tokens: undefined } })
  expect(t).toContain('ctx after 1st reply')
  expect(t).not.toContain(' 0%')
})

test('the line starts with a separator, so it never runs into the hint', () => {
  const line = minibarLine({ usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW }, 50, 200)
  expect(text(line).startsWith('  │ Opus 5.5')).toBe(true)
  expect([...text(minibarLine({ usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW }, 50, 100))].length <= 100 - 50 - 6).toBe(true)
  expect(minibarLine({ usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW }, 95, 100)).toEqual([])
})

test('a pace that hits the wall says so', () => {
  expect(bar({ usage: { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 70, resetsAt: iso(NOW + 2.5 * H) }] } })).toContain('70% → 140% ⚠')
})

test('items that do not fit are dropped from the right', () => {
  const narrow = bar({}, 40)
  expect([...narrow].length <= 40).toBe(true)
  expect(narrow.startsWith('Opus 5.5 ▮▮▮▯▯')).toBe(true)
  expect(narrow).not.toContain('5h')
  expect(bar({}, 5)).toBe('')
})

test('on a row of its own, no lead and the whole width', () => {
  const input = { usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW }
  const row = text(minibarRow(input, 200))
  expect(row.startsWith('Opus 5.5')).toBe(true)
  expect(row).toBe(bar())
  expect(text(minibarRow(input, 30))).toBe('Opus 5.5 ▮▮▮▯▯')
  expect(minibarRow(input, 10)).toEqual([])
})

const git = { cwd: '/w', repo: null, branch: 'main', files: 1, added: 3, removed: 1, ahead: null, behind: null, sessionFiles: [] }

test('branch & diff, the diff left out when unknown', () => {
  const settings = { ...DEFAULT_SETTINGS, cardLines: ['repo' as const] }
  expect(bar({ settings, git })).toBe(' main +3 −1')
  expect(bar({ settings, git: { ...git, files: null, added: null, removed: null } })).toBe(' main')
})

test('a window read before its reset shows no figure', () => {
  const stale = { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 80, resetsAt: iso(NOW - 60_000) }] }
  const t = bar({ usage: stale })
  expect(t).not.toContain('80%')
  expect(t.endsWith('5h —')).toBe(true)
})

test('the budget counts cells: a wide ⛔ does not run past it', () => {
  const full = { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW + H) }] }
  const all = bar({ usage: full })
  expect(all).toContain('⛔')
  const codePoints = [...all].length
  expect(cellWidth(bar({ usage: full }, codePoints)) <= codePoints).toBe(true)
})
