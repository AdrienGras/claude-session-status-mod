/** One slice of the context window, in the colour /context gives its category. */
export type Segment = { label: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

/** What the repo section draws; null fields are unknown, never zero. */
export type GitSnapshot = {
  cwd: string
  repo: string | null
  branch: string | null
  files: number
  added: number
  removed: number
  ahead: number | null
  behind: number | null
  sessionFiles: string[]
}

export type CardLine = 'model' | 'context' | 'five_hour' | 'seven_day' | 'cost' | 'repo'

export type Settings = { cardLines: CardLine[]; barWidth: number }

export type Speed = { ttftMs: number; tokPerS: number | null }

/** Main-loop facts learnt from the session's events; null until seen. */
export type Live = {
  model: string | null
  effort: string | null
  permissionMode: string | null
  isWorking: boolean
  requests: number
  speed: Speed | null
}

/** What the mod counts itself, since `since` (load or /clear). */
export type Counters = { since: number; compactions: number; tools: Record<string, number>; subagents: number }

/** The running turn, or the last one. */
export type Receipt = {
  isRunning: boolean
  startedAt: number
  durationMs: number | null
  agents: number
  edits: number
  errors: number
  costAddedUsd: number | null
}

/** A rate-limit window, as `$.session.usage()` reads it. */
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** The part of the context breakdown the drawings read. */
export type BreakdownView = {
  categories: { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  memoryFiles: { path: string; tokens: number }[]
  mcpTools: { name: string; serverName: string; tokens: number }[]
  agents: { agentType: string; tokens: number }[]
  skills?: { totalSkills: number; tokens: number }
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
  autocompactSource: string
}

/** The session's readings as the drawings use them. */
export type UsageView = {
  startedAt: number
  tokens?: number
  window: number
  rateLimits: RateLimit[]
  costUsd?: number
  prompts: number
  breakdown: BreakdownView | null
  breakdownDetail: 'summary' | 'full'
}

declare module 'claude-code' {
  interface PluginState {
    'session-status': {
      usage: UsageView | null
      live: Live
      counters: Counters
      receipt: Receipt | null
      git: GitSnapshot | null
      settings: Settings
      expanded: string[]
    }
  }
}
