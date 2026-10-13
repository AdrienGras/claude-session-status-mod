import { expect, test } from 'claude-code/testing'

import { fitLine, paneRows } from '../hooks/pane-rows'
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

const text = (parts: { text: string }[]) => parts.map(p => p.text).join('')
const rowText = (r: ReturnType<typeof paneRows>[number]) =>
  r.kind === 'groups' ? text(r.lead) + r.groups.map(g => text(g.parts)).join('') + text(r.tail) : text(r.parts)
const all = (i: PaneInput) => paneRows(i).map(rowText)
const box = (i: PaneInput, title: string) => {
  const rows = all(i)
  const start = rows.findIndex(r => r.startsWith(`╭─ ${title}`))
  if (start < 0) return undefined
  const end = rows.findIndex((r, k) => k > start && r.startsWith('╰'))
  return rows.slice(start, end + 1).join('\n')
}

test('one box per section, in order, the estimate marked', () => {
  const tops = all(input()).filter(r => r.startsWith('╭─ ')).map(r => r.slice(3).split(' ')[0])
  expect(tops).toEqual(['Opus', 'Context', 'Quotas', 'Session', 'Repo'])
  expect(box(input(), 'Context ≈')).toBeDefined()
  expect(box(input({ usage: { ...input().usage!, breakdownDetail: 'full' } }), 'Context ─')).toBeDefined()
})

test('every row spans the pane exactly, however long its content', () => {
  for (const columns of [48, 60]) {
    const long = input({
      columns,
      git: { ...input().git!, cwd: `/srv/${'very-long-directory/'.repeat(6)}x`, sessionFiles: [`${'deep/'.repeat(20)}file.ts`] },
      expanded: ['memory', 'mcp', 'agents'],
    })
    for (const r of all(long)) expect([...r].length).toBe(columns)
  }
})

test('header: model and state in the frame, effort, mode, requests, speed, window', () => {
  const t = box(input(), 'Opus 5.5')!
  expect(t.split('\n')[0]).toContain('○ idle')
  for (const s of ['effort ▮▮▮▯▯ high', 'mode auto', '3 req', 'ttft 0.8s · 42 tok/s', 'window 1M']) expect(t).toContain(s)
  expect(box(input({ live: { ...EMPTY_LIVE, model: 'claude-opus-5-5', isWorking: true } }), 'Opus 5.5')).toContain('● working')
  expect(box(input({ live: { ...EMPTY_LIVE, model: 'x' } }), 'x')).not.toContain('ttft')
})

test('context: the figure in the frame, the biggest categories, the room before compaction', () => {
  const t = box(input(), 'Context ≈')!
  expect(t.split('\n')[0]).toContain('140k/1M 14%')
  expect(t).toContain('Messages')
  expect(t).toMatch(/auto-compact in +20k/)
})

test('the legend keeps four categories, folds the rest in other, hides the empty ones', () => {
  const cats = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => ({ name, tokens: (6 - i) * 1_000, color: 'claude', kind: 'used' as const }))
  const usage = { ...input().usage!, tokens: 21_000, breakdown: { ...input().usage!.breakdown!, categories: [...cats, { name: 'Zero', tokens: 0, color: 'claude', kind: 'used' as const }] } }
  const t = box(input({ usage }), 'Context ≈')!
  for (const name of ['A', 'B', 'C', 'D']) expect(t).toMatch(new RegExp(`■ ${name} `))
  expect(t).not.toMatch(/■ E /)
  expect(t).toMatch(/other +3k/)
  expect(t).not.toContain('Zero')
})

test('context lists unfold on demand, two to a row', () => {
  const rows = paneRows(input()).filter(r => r.kind === 'groups')
  expect(rows.length).toBe(2)
  expect(rows.flatMap(r => (r.kind === 'groups' ? r.groups.map(g => g.key) : []))).toEqual(['memory', 'mcp', 'skills', 'agents'])
  expect(all(input()).join('\n')).toContain('▸ MCP 1 · 1k')
  expect(all(input({ expanded: ['mcp'] })).join('\n')).toContain('github')
})

test('quotas: used, projection and verdict, then the reset; no box without windows', () => {
  const t = box(input(), 'Quotas')!
  for (const s of [' 20%', '→ 40% ✓ +7h30', '⧗2h30']) expect(t).toContain(s)
  expect(t).toMatch(/resets \d\d:\d\d/)
  expect(box(input({ usage: { ...input().usage!, rateLimits: [] } }), 'Quotas')).toBe(undefined)
})

test('a spend limit past 100% is a plain gauge with its real value', () => {
  const t = box(input({ usage: { ...input().usage!, rateLimits: [{ kind: 'spend_limit', percentUsed: 112 }] } }), 'Quotas')!
  expect(t).toContain('112%')
  expect(t).not.toContain('→')
})

test('session: cost in the frame, rates, counts since open, last turn', () => {
  const t = box(input(), 'Session')!
  expect(t.split('\n')[0]).toContain('$4.80')
  for (const s of ['$2.40/h', '$0.20/prompt', '2h', '24 prompts', 'since open', '1 compaction', '2 subagents', 'Read 9', 'last turn 7s', '2 edits', '+$0.15']) expect(t).toContain(s)
})

test('repo: branch in the frame, diff, upstream, files of this session', () => {
  const t = box(input(), 'Repo')!
  expect(t.split('\n')[0]).toContain('main')
  for (const s of ['me/project', '+42', '−7', '3 files', '↑2 ↓0', 'hooks/a.ts']) expect(t).toContain(s)
  expect(box(input({ git: { ...input().git!, ahead: null, behind: null } }), 'Repo')).not.toContain('↑')
})

test('a line too long is cut with an ellipsis', () => {
  expect(text(fitLine([{ text: 'abcdef' }, { text: 'ghij' }], 8))).toBe('abcdefg…')
  expect(text(fitLine([{ text: 'abc' }], 8))).toBe('abc')
})
