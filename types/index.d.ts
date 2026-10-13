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

declare module 'claude-code' {
  interface PluginState {
    'session-status': Record<string, never>
  }
}
