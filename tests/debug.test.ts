import type { SessionUsage } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { debugReport } from '../hooks/debug'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { EMPTY_LIVE, emptyCounters } from '../hooks/state'

const usage = {
  startedAt: 0,
  context: {
    tokens: 140_000,
    window: 1_000_000,
    percent: 14,
    breakdown: {
      categories: [{ name: 'Messages', tokens: 90_000, color: 'claude', kind: 'used', isDeferred: false }],
      memoryFiles: [{ path: '/home/alice/.claude/CLAUDE.md', type: 'User', tokens: 800 }],
      mcpTools: [{ name: 'mcp__secret-server__lookup', serverName: 'secret-server', tokens: 300, isLoaded: true }],
      agents: [{ agentType: 'private-agent', source: 'user', tokens: 90 }],
      skills: { totalSkills: 2, includedSkills: 2, tokens: 500, skillFrontmatter: [{ name: 'hidden-skill' }] },
      gridRows: [],
      isAutoCompactEnabled: true,
      autocompactSource: 'model-default',
    },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 20 }],
  cost: { usd: 1.5 },
} as unknown as SessionUsage

const mod = {
  live: { ...EMPTY_LIVE, model: 'claude-opus-5-5' },
  counters: { ...emptyCounters(0), tools: { Edit: 2, 'mcp__secret-server__lookup': 1 } },
  receipt: null,
  git: {
    cwd: '/work/alice/project',
    repo: 'alice/secret-repo',
    branch: 'feature/secret',
    files: 3,
    added: 10,
    removed: 2,
    ahead: 1,
    behind: 0,
    sessionFiles: ['private/notes.md'],
  },
  settings: DEFAULT_SETTINGS,
}

test('the debug report carries no path, server, agent, skill, repo or branch name', () => {
  const text = JSON.stringify(debugReport(usage, mod))
  for (const secret of ['alice', 'secret-server', 'private-agent', 'hidden-skill', 'secret-repo', 'feature/secret', 'notes.md', '/work']) {
    expect(text).not.toContain(secret)
  }
})

test('the debug report keeps the figures a bug report needs', () => {
  const r = debugReport(usage, mod)
  expect(r.context.tokens).toBe(140_000)
  expect(r.context.memoryFiles).toBe(1)
  expect(r.context.mcpServers).toBe(1)
  expect(r.context.categories).toEqual([{ name: 'Messages', tokens: 90_000, kind: 'used' }])
  expect(r.rateLimits).toEqual([{ kind: 'five_hour', percentUsed: 20 }])
  expect(r.mod.counters.tools).toEqual({ Edit: 2, mcp: 1 })
  expect(r.mod.git).toEqual({ inRepo: true, hasRemote: true, hasBranch: true, files: 3, added: 10, removed: 2, ahead: 1, behind: 0, sessionFiles: 1 })
})
