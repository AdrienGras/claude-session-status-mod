/** One slice of the context window, in the colour /context gives its category. */
export type Segment = { label: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

declare module 'claude-code' {
  interface PluginState {
    'session-status': Record<string, never>
  }
}
