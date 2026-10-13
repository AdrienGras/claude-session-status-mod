import { expect, test } from 'claude-code/testing'

import { cellWidth } from '../hooks/cells'
import { fitLine, paneRows } from '../hooks/pane-rows'
import type { PaneInput } from '../hooks/pane-rows'
import type { AgentCard } from '../types'
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
      skills: { totalSkills: 3, tokens: 1_200, items: [{ name: 'review', tokens: 300 }, { name: 'deploy', tokens: 900 }] },
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
  agents: [],
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
    for (const r of all(long)) expect(cellWidth(r)).toBe(columns)
  }
})

test('every row spans the pane in cells, with wide glyphs and a long branch', () => {
  const wide = input({
    usage: { ...input().usage!, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW + H) }] },
    git: { ...input().git!, cwd: '/srv/プロジェクト/日本語のフォルダ/もっと長い名前', branch: 'dependabot/npm_and_yarn/typescript-5.9.3', sessionFiles: ['ドキュメント/会議.md'] },
  })
  const rows = all(wide)
  expect(rows.join('\n')).toContain('⛔')
  for (const r of rows) expect(cellWidth(r)).toBe(48)
  const top = rows.find(r => r.startsWith('╭─ Repo'))!
  expect(top.endsWith('─╮')).toBe(true)
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
  expect(all(input()).join('\n')).toContain('▸ MCP 1 · 800')
  expect(all(input({ expanded: ['mcp'] })).join('\n')).toContain('github')
})

test('the skills list unfolds onto its skills, the biggest first', () => {
  const t = all(input({ expanded: ['skills'] })).join('\n')
  expect(t.indexOf('deploy') >= 0 && t.indexOf('deploy') < t.indexOf('review')).toBe(true)
  const many = Array.from({ length: 14 }, (_, i) => ({ name: `skill-${i}`, tokens: 100 - i }))
  const usage = input().usage!
  const long = all(input({ expanded: ['skills'], usage: { ...usage, breakdown: { ...usage.breakdown!, skills: { totalSkills: 14, tokens: 1_309, items: many } } } })).join('\n')
  expect(long).toContain('skill-9')
  expect(long).not.toContain('skill-10')
  expect(long).toContain('+4 more')
})

test('quotas: used, projection and verdict, then the reset; no box without windows', () => {
  const t = box(input(), 'Quotas')!
  for (const s of [' 20%', '→ 40% ✓ +7h30', '⧗2h30']) expect(t).toContain(s)
  expect(t).toMatch(/resets \d\d:\d\d/)
  expect(box(input({ usage: { ...input().usage!, rateLimits: [] } }), 'Quotas')).toBe(undefined)
})

test('a window read before its reset shows no figure until the next reply', () => {
  const stale = { kind: 'five_hour', percentUsed: 80, resetsAt: iso(NOW - 60_000) }
  const t = box(input({ usage: { ...input().usage!, rateLimits: [stale] } }), 'Quotas')!
  expect(t).not.toContain('80%')
  expect(t).not.toContain('→')
  expect(t).toContain('5h —')
  expect(t).toContain('reset; figures with the next reply')
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

test('a frame without a figure closes without a gap', () => {
  const top = all(input()).find(r => r.startsWith('╭─ Quotas'))!
  expect(top).not.toContain('─ ─')
  expect(top.endsWith('──╮')).toBe(true)
})

test('repo: an unknown diff is left out, a detached HEAD keeps its diff', () => {
  const unknown = box(input({ git: { ...input().git!, files: null, added: null, removed: null } }), 'Repo')!
  expect(unknown).toContain('me/project')
  expect(unknown).not.toContain('+')
  expect(unknown).not.toContain('files')
  const detached = box(input({ git: { ...input().git!, branch: null } }), 'Repo')!
  expect(detached).toContain('+42 −7 · 3 files')
  const bare = box(input({ git: { ...input().git!, branch: null, repo: null } }), 'Repo')!
  expect(bare).toContain('+42 −7 · 3 files')
})

test('a long repo name moves the diff to a row of its own, uncut', () => {
  const t = box(input({ git: { ...input().git!, repo: 'AdrienGras/claude-session-status-mod' } }), 'Repo')!
  expect(t).toContain('AdrienGras/claude-session-status-mod')
  expect(t).toContain('+42 −7 · 3 files · ↑2 ↓0')
})

test('before the first reply the context box shows the estimate and says so', () => {
  const t = box(input({ usage: { ...input().usage!, tokens: undefined } }), 'Context ≈')!
  expect(t.split('\n')[0]).toContain('≈96k/1M 10%')
  expect(t).toContain('estimate until the first reply')
})

test('with no figure at all the context box says when it comes', () => {
  const t = box(input({ usage: { ...input().usage!, tokens: undefined, breakdown: null } }), 'Context')!
  expect(t).toContain('fills after the first reply')
})

test('a weekly reset names its day', () => {
  const t = box(input(), 'Quotas')!
  expect(t).toMatch(/resets [A-Z][a-z]{2} \d{1,2} \d\d:\d\d/)
})

const card = (over: Partial<AgentCard> = {}): AgentCard => ({
  id: 'a1',
  type: 'Explore',
  task: 'find the auth code',
  startedAt: NOW - 72_000,
  endedAt: null,
  state: 'running',
  steps: 7,
  contextTokens: 24_000,
  outputTokens: 3_100,
  calls: [],
  ...over,
})

test('agents: one card per subagent, state and time in the row, figures under it', () => {
  const done = card({ id: 'a2', type: 'Plan', task: 'plan it', startedAt: NOW - 60_000, endedAt: NOW - 12_000, state: 'done' })
  const t = box(input({ agents: [done, card()] }), 'Agents')!
  expect(t.split('\n')[0]).toContain('1 running')
  expect(t).toContain('▸ Explore · find the auth code')
  expect(t).toContain('● 1m12s')
  expect(t).toContain('ctx 24k · 3.1k out · 7 steps')
  expect(t).toContain('✓ 48s')
  expect(t.indexOf('Explore')).toBeLessThan(t.indexOf('Plan'))
})

test('agents: unfolded, the last calls; none yet, said so', () => {
  const calls = box(input({ agents: [card({ calls: [{ tool: 'Read', detail: '/w/a.ts' }] })], expanded: ['agent:a1'] }), 'Agents')!
  expect(calls).toContain('Read')
  expect(calls).toContain('/w/a.ts')
  expect(box(input({ agents: [card()], expanded: ['agent:a1'] }), 'Agents')).toContain('no tool calls yet')
  const unknown = box(input({ agents: [card({ contextTokens: null, steps: 0, outputTokens: 0 })] }), 'Agents')!
  expect(unknown).toContain('0 out')
  expect(unknown).not.toContain('ctx')
})

test('agents: an empty task leaves no dangling separator', () => {
  const t = box(input({ agents: [card({ task: '' })] }), 'Agents')!
  expect(t).toContain('▸ Explore')
  expect(t).not.toContain('Explore ·')
})

test('agents: no subagent, no box', () => {
  expect(box(input(), 'Agents')).toBeUndefined()
})

test('agents: wide glyphs and long tasks stay in the frame', () => {
  const c = card({ task: `調査${'長いタスク'.repeat(40)}`, calls: [{ tool: 'Read', detail: 'ドキュメント/会議.md' }] })
  for (const columns of [48, 60]) {
    for (const r of all(input({ columns, agents: [c], expanded: ['agent:a1'] }))) expect(cellWidth(r)).toBe(columns)
  }
})
