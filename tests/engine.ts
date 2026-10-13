// A stand-in for the engine beneath the plugin, shared by the integration tests.
import type { On, SessionUsage } from 'claude-code'

export type FakeEngine = {
  usage: SessionUsage
  model: string
  turns: number
  openPanes: Set<string>
  commands: string[]
}

export const fakeEngine = (on: On, usage?: Partial<SessionUsage>): FakeEngine => {
  const fake: FakeEngine = {
    usage: {
      startedAt: 0,
      context: { tokens: 140_000, window: 1_000_000, percent: 14 },
      rateLimits: [],
      ...usage,
    },
    model: 'Opus 5.5',
    turns: 0,
    openPanes: new Set(),
    commands: [],
  }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => (fake.commands.push(e.name), { value: { command: e.name } }))
  on('session.usage', () => ({ value: fake.usage }))
  on('session.model', () => ({ value: fake.model }))
  on('session.turns', () => ({ value: fake.turns }))
  on('ui.open', (_$, e) => (fake.openPanes.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', (_$, e) => (fake.openPanes.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...fake.openPanes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) as never,
  }))
  return fake
}

export const startSession = ($: { session: { start: (e: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)

// What the engine stamps on a typed slash command.
export const typed = (command: string, args = '') => ({
  command,
  args,
  origin: { kind: 'user' } as never,
  presentation: { isFullscreen: true, columns: 160 },
})
