// A stand-in for the engine beneath the plugin, shared by the integration tests.
import type { On, SessionUsage } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

export type FakeEngine = {
  usage: SessionUsage
  model: string
  turns: number
  openPanes: Set<string>
  /** Open panes that are a tab behind another (isShown false), until opened with focus. */
  hiddenPanes: Set<string>
  commands: string[]
  commandSpecs: { name: string; immediate?: true }[]
  clock: MockClock
  usageCalls: unknown[]
  /** Usage reads refused before the next one answers (an engine not ready yet). */
  usageFailures: number
  repo: { root: string; remote: string | null } | null
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
    hiddenPanes: new Set(),
    commands: [],
    commandSpecs: [],
    clock: mock.clock(on),
    usageCalls: [],
    usageFailures: 0,
    repo: null,
  }
  mock.store(on)
  on('session.cwd', () => ({ value: '/work/x' }))
  on('session.repo', () => ({ value: fake.repo && { ...fake.repo, internal: false, name: null } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => (fake.commands.push(e.name), fake.commandSpecs.push(e), { value: { command: e.name } }))
  on('session.usage', (_$, e) => {
    fake.usageCalls.push(e)
    if (fake.usageFailures > 0) {
      fake.usageFailures -= 1
      throw new Error('usage not ready')
    }
    return { value: fake.usage }
  })
  on('session.model', () => ({ value: fake.model }))
  on('session.turns', () => ({ value: fake.turns }))
  on('ui.open', (_$, e) => {
    fake.openPanes.add(e.id)
    if (e.focus) fake.hiddenPanes.delete(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => (fake.openPanes.delete(e.id), fake.hiddenPanes.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...fake.openPanes].map(id => ({ id, title: id, isShown: !fake.hiddenPanes.has(id), isFocused: false, isPlaced: true })) as never,
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

/** The mod's own state, as `/sst debug` dumps it. */
export const modState = async ($: { command: { run: (e: never) => Promise<unknown> } }) => {
  const out = (await $.command.run(typed('sst', 'debug') as never)) as { text?: string }
  return JSON.parse(out.text ?? '{}').mod as {
    live: { model: string | null; effort: string | null; isWorking: boolean; requests: number; speed: unknown }
    counters: { compactions: number; tools: Record<string, number>; subagents: number }
    receipt: { edits: number; errors: number; agents: number; isRunning: boolean } | null
    settings: { cardLines: string[]; barWidth: number; hintLayout: string }
  }
}

/** The side pane as a surface mounts it. */
export const paneTarget = (bodyColumns = 48, placement: 'dock' | 'inline' = 'dock') => ({
  plugin: 'session-status',
  component: 'Pane' as const,
  requestId: 'sst',
  props: { title: 'Session', isFocused: true, bodyColumns, placement, scroll: { offset: 0, bodyRows: 80 }, view: {} },
  surface: 'terminal' as const,
})

export const configTarget = () => ({ ...paneTarget(), requestId: 'sst-config', props: { ...paneTarget().props, title: 'Status settings' } })
