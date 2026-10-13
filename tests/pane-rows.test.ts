import { expect, test } from 'claude-code/testing'

import { fitLine, paneSections } from '../hooks/pane-rows'
import type { PaneInput } from '../hooks/pane-rows'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { EMPTY_LIVE, emptyCounters } from '../hooks/state'

const NOW = 1_000_000_000
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

const input = (over: Partial<PaneInput> = {}): PaneInput => ({
  usage: {
    startedAt: NOW - 2 * H,
    tokens: 140_000,
    window: 1_000_000,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: iso(NOW + 2.5 * H) },
      { kind: 'seven_day', percentUsed: 23, resetsAt: iso(NOW + 84 * H) },
    ],
    costUsd: 4.8,
    prompts: 24,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 6_000, color: 'promptBorder', kind: 'used' },
        { name: 'Messages', tokens: 90_000, color: 'claude', kind: 'used' },
        { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', kind: 'buffer' },
        { name: 'Free space', tokens: 0, color: 'promptBorder', kind: 'free' },
      ],
      memoryFiles: [{ path: '/home/me/.claude/CLAUDE.md', tokens: 800 }],
      mcpTools: [
        { name: 'a', serverName: 'github', tokens: 700 },
        { name: 'b', serverName: 'github', tokens: 100 },
      ],
      agents: [{ agentType: 'Explore', tokens: 90 }],
      skills: { totalSkills: 3, tokens: 1_200 },
      autoCompactThreshold: 160_000,
      isAutoCompactEnabled: true,
      autocompactSource: 'model-default',
    },
    breakdownDetail: 'summary',
  },
  live: { ...EMPTY_LIVE, model: 'claude-opus-5-5', effort: 'high', permissionMode: 'auto', requests: 3, speed: { ttftMs: 800, tokPerS: 42 } },
  counters: { ...emptyCounters(0), compactions: 1, tools: { Edit: 4, Read: 9 }, subagents: 2 },
  receipt: { isRunning: false, startedAt: 0, durationMs: 7_000, agents: 0, edits: 2, errors: 0, costAddedUsd: 0.15 },
  git: { cwd: '/srv/me/project', repo: 'me/project', branch: 'main', files: 3, added: 42, removed: 7, ahead: 2, behind: 0, sessionFiles: ['hooks/a.ts'] },
  settings: DEFAULT_SETTINGS,
  expanded: [],
  now: NOW,
  columns: 48,
  ...over,
})

const text = (line: { text: string }[]) => line.map(p => p.text).join('')
const sectionText = (i: PaneInput, key: string) => {
  const s = paneSections(i).find(x => x.key === key)
  if (!s) return undefined
  return [s.title, ...s.lines.map(text), ...s.groups.flatMap(g => [text(g.summary), ...g.items.map(text)])].join('\n')
}

test('five sections in order, the estimate marked', () => {
  const sections = paneSections(input())
  expect(sections.map(s => s.key)).toEqual(['header', 'context', 'quotas', 'session', 'repo'])
  expect(sections[1]?.title).toBe('Context ≈')
  expect(paneSections(input({ usage: { ...input().usage!, breakdownDetail: 'full' } }))[1]?.title).toBe('Context')
})

test('header: model, effort, mode, state, requests, speed, window', () => {
  const t = sectionText(input(), 'header')!
  for (const s of ['Opus 5.5', 'effort ▮▮▮▯▯ high', 'mode auto', '○ idle', '3 req', 'ttft 0.8s · 42 tok/s', 'window 1M (model-default)']) expect(t).toContain(s)
  expect(sectionText(input({ live: { ...EMPTY_LIVE, model: 'claude-opus-5-5', isWorking: true } }), 'header')).toContain('● working')
  expect(sectionText(input({ live: { ...EMPTY_LIVE, model: 'x' } }), 'header')).not.toContain('ttft')
})

test('context: legend by category and the room before auto-compaction', () => {
  const t = sectionText(input(), 'context')!
  expect(t).toContain('140k/1M 14%')
  expect(t).toContain('Messages')
  expect(t).toContain('auto-compact in 20k')
})

test('context groups unfold on demand', () => {
  const closed = paneSections(input()).find(s => s.key === 'context')!.groups
  expect(closed.map(g => g.key)).toEqual(['memory', 'mcp', 'skills', 'agents'])
  expect(closed.every(g => g.items.length === 0)).toBe(true)
  expect(text(closed[1]!.summary)).toContain('1 MCP server')
  const open = paneSections(input({ expanded: ['mcp'] })).find(s => s.key === 'context')!.groups
  expect(open[1]!.items.map(text).join('\n')).toContain('github')
})

test('quotas: burn bars with reset time; none when the account reports none', () => {
  const t = sectionText(input(), 'quotas')!
  expect(t).toContain('→ 40%')
  expect(t).toContain(' 20%')
  expect(t).toContain('⧗2h30')
  expect(t).toMatch(/resets \d\d:\d\d/)
  expect(sectionText(input({ usage: { ...input().usage!, rateLimits: [] } }), 'quotas')).toBe(undefined)
})

test('a spend limit past 100% is a plain gauge with its real value', () => {
  const t = sectionText(input({ usage: { ...input().usage!, rateLimits: [{ kind: 'spend_limit', percentUsed: 112 }] } }), 'quotas')!
  expect(t).toContain('112%')
  expect(t).not.toContain('→')
})

test('session: cost rates, counts since open, last turn', () => {
  const t = sectionText(input(), 'session')!
  for (const s of ['$4.80', '$2.40/h', '$0.20/prompt', '2h', '24 prompts', 'since open', '1 compaction', '2 subagents', 'Read 9', 'last turn 7s', '2 edits', '+$0.15']) expect(t).toContain(s)
})

test('repo: branch, diff, upstream, files of this session', () => {
  const t = sectionText(input(), 'repo')!
  for (const s of ['me/project', 'main', '+42', '−7', '3 files', '↑2 ↓0', 'hooks/a.ts']) expect(t).toContain(s)
  const noUpstream = sectionText(input({ git: { ...input().git!, ahead: null, behind: null } }), 'repo')!
  expect(noUpstream).not.toContain('↑')
})

test('nothing runs past a narrow inline pane', () => {
  const long = input({
    columns: 60,
    git: { ...input().git!, cwd: `/srv/${'very-long-directory/'.repeat(6)}x`, sessionFiles: [`${'deep/'.repeat(20)}file.ts`] },
  })
  for (const s of paneSections(long)) {
    for (const line of [...s.lines, ...s.groups.flatMap(g => [g.summary, ...g.items])]) {
      expect([...text(line)].length <= 60).toBe(true)
    }
  }
})

test('a line too long is cut with an ellipsis', () => {
  expect(text(fitLine([{ text: 'abcdef' }, { text: 'ghij' }], 8))).toBe('abcdefg…')
  expect(text(fitLine([{ text: 'abc' }], 8))).toBe('abc')
})
