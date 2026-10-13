import { expect, test } from 'claude-code/testing'

import { cardRows, effortGauge, prettyModel } from '../hooks/card-rows'
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
  rateLimits: [
    { kind: 'five_hour', percentUsed: 20, resetsAt: iso(NOW + 2.5 * H) },
    { kind: 'seven_day', percentUsed: 23, resetsAt: iso(NOW + 3.5 * 24 * H) },
  ],
  costUsd: 4.82,
  prompts: 12,
  breakdown: null,
  breakdownDetail: 'summary',
}
const live = { ...EMPTY_LIVE, model: 'claude-opus-5-5', effort: 'high' }
const line = (parts: { text: string }[]) => parts.map(p => p.text).join('')
const all = (rows: { parts: { text: string }[] }[]) => rows.map(r => line(r.parts)).join('\n')

test('model ids read as their family and version', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(prettyModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(prettyModel('Opus 5.5')).toBe('Opus 5.5')
  expect(prettyModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(prettyModel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
})

test('effort as five notches, an unknown level as a word', () => {
  expect(line(effortGauge('high'))).toBe('effort ▮▮▮▯▯ high')
  expect(line(effortGauge('max'))).toBe('effort ▮▮▮▮▮ max')
  expect(line(effortGauge('42'))).toBe('effort 42')
})

test('the default card: model and effort, context, the 5h window', () => {
  const rows = cardRows({ usage, live, git: null, settings: DEFAULT_SETTINGS, now: NOW })
  expect(rows.map(r => r.key)).toEqual(['model', 'context', 'five_hour'])
  const text = all(rows)
  expect(text).toContain('Opus 5.5')
  expect(text).toContain('effort ▮▮▮▯▯ high')
  expect(text).toContain('ctx')
  expect(text).toContain('140k/1M 14%')
  expect(text).toContain('5h')
  expect(text).toContain('→ 40%')
  expect(text).toContain('✓ +7h30')
})

test('no rate limits: no quota line at all', () => {
  const rows = cardRows({ usage: { ...usage, rateLimits: [] }, live, git: null, settings: { ...DEFAULT_SETTINGS, cardLines: ['five_hour', 'seven_day'] }, now: NOW })
  expect(rows).toEqual([])
})

test('before the first reading the context is a dash, never 0%', () => {
  const rows = cardRows({ usage: { ...usage, tokens: undefined }, live, git: null, settings: DEFAULT_SETTINGS, now: NOW })
  const ctx = line(rows.find(r => r.key === 'context')!.parts)
  expect(ctx).toContain('—')
  expect(ctx).not.toContain('0%')
})

test('no effort known: the model alone', () => {
  const rows = cardRows({ usage, live: { ...live, effort: null }, git: null, settings: DEFAULT_SETTINGS, now: NOW })
  expect(line(rows[0]!.parts)).toBe('Opus 5.5')
})

test('a window without a reset time is a plain percentage', () => {
  const rows = cardRows({ usage: { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }] }, live, git: null, settings: { ...DEFAULT_SETTINGS, cardLines: ['five_hour'] }, now: NOW })
  const text = line(rows[0]!.parts)
  expect(text).toContain('20%')
  expect(text).not.toContain('→')
})

test('cost and repo lines when asked', () => {
  const git = { cwd: '/w', repo: 'o/r', branch: 'main', files: 2, added: 42, removed: 7, ahead: null, behind: null, sessionFiles: [] }
  const rows = cardRows({ usage, live, git, settings: { ...DEFAULT_SETTINGS, cardLines: ['cost', 'repo'] }, now: NOW })
  expect(all(rows)).toBe('$4.82\n main +42 −7')
})
