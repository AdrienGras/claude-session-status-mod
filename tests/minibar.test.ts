import { expect, test } from 'claude-code/testing'

import { minibarParts } from '../hooks/minibar-rows'
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

test('the default line: model and effort, context, the 5h window, cost', () => {
  const t = bar()
  expect(t.startsWith('Opus 5.5 ▮▮▮▯▯ │ ctx ')).toBe(true)
  expect(t).toContain(' 14% │ 5h ')
  expect(t).toContain(' 20% → 40% ✓ │ $4.82')
})

test('no rate limits: no quota item', () => {
  expect(bar({ usage: { ...usage, rateLimits: [] } })).not.toContain('5h')
})

test('before the first reading the context is a dash, never 0%', () => {
  const t = bar({ usage: { ...usage, tokens: undefined } })
  expect(t).toContain('ctx ')
  expect(t).toContain('—')
  expect(t).not.toContain(' 0%')
})

test('a pace that hits the wall says so', () => {
  expect(bar({ usage: { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 70, resetsAt: iso(NOW + 2.5 * H) }] } })).toContain('70% → 140% ⚠')
})

test('items that do not fit are dropped from the right', () => {
  const narrow = bar({}, 40)
  expect([...narrow].length <= 40).toBe(true)
  expect(narrow.startsWith('Opus 5.5 ▮▮▮▯▯')).toBe(true)
  expect(narrow).not.toContain('$4.82')
  expect(bar({}, 5)).toBe('')
})
