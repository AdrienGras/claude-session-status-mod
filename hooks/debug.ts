// What `/sst debug` prints for a bug report: figures and categories only. It ends up pasted in
// public issues, so nothing local passes: no path, server, agent, skill, repo or branch name.
import type { SessionUsage } from 'claude-code'

import type { Counters, GitSnapshot, Live, Receipt, Settings } from '../types'

type ModState = { live: Live; counters: Counters; receipt: Receipt | null; git: GitSnapshot | null; settings: Settings }

/** `mcp__server__tool` names a server: every MCP tool counts as `mcp`. */
const toolKind = (name: string) => (name.startsWith('mcp__') ? 'mcp' : name)

export const debugReport = (usage: SessionUsage, mod: ModState) => {
  const b = usage.context.breakdown
  const tools: Record<string, number> = {}
  for (const [name, n] of Object.entries(mod.counters.tools)) tools[toolKind(name)] = (tools[toolKind(name)] ?? 0) + n
  const g = mod.git
  return {
    startedAt: usage.startedAt,
    rateLimits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}) })),
    costUsd: usage.cost?.usd,
    context: {
      tokens: usage.context.tokens,
      window: usage.context.window,
      percent: usage.context.percent,
      categories: b?.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      memoryFiles: b?.memoryFiles.length,
      mcpServers: b && new Set(b.mcpTools.map(t => t.serverName)).size,
      mcpTools: b?.mcpTools.length,
      agents: b?.agents.length,
      skills: b?.skills?.totalSkills,
      autoCompactThreshold: b?.autoCompactThreshold,
      isAutoCompactEnabled: b?.isAutoCompactEnabled,
      autocompactSource: b?.autocompactSource,
    },
    mod: {
      live: mod.live,
      counters: { ...mod.counters, tools },
      receipt: mod.receipt,
      git: g && {
        inRepo: g.branch !== null || g.repo !== null,
        hasRemote: g.repo !== null,
        hasBranch: g.branch !== null,
        files: g.files,
        added: g.added,
        removed: g.removed,
        ahead: g.ahead,
        behind: g.behind,
        sessionFiles: g.sessionFiles.length,
      },
      settings: mod.settings,
    },
  }
}
