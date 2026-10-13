// Session lifecycle and events → state atoms. Every hook observes and hands back what is beneath unchanged.
import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { toBreakdownView } from './context'
import { makeGitReader } from './git'
import { stepSpeed } from './session'
import { normalizeSettings, SETTINGS_KEY } from './settings'
import { EMPTY_LIVE, emptyCounters, INITIAL_SETTINGS } from './state'
import { S as STR } from './strings'
import type { GitSnapshot, Receipt, UsageView } from '../types'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

type Dollar = EngineInterface

const usageAtom = atom({ plugin: 'session-status', key: 'usage' } as const, null as UsageView | null)
const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const countersAtom = atom({ plugin: 'session-status', key: 'counters' } as const, emptyCounters(0))
const receiptAtom = atom({ plugin: 'session-status', key: 'receipt' } as const, null as Receipt | null)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

const gitReader = makeGitReader()

/** The git reader on the engine's own calls (the validator follows `$` only through this file). */
async function readGit($: Dollar, startedAt: number): Promise<GitSnapshot> {
  return gitReader(
    {
      clock: { now: () => $.clock.now() },
      session: { cwd: () => $.session.cwd(), repo: () => $.session.repo() },
      process: { run: (argv, init) => $.process.run(argv, init) },
      fs: { stat: path => $.fs.stat(path) },
    },
    startedAt,
  )
}

// Set by a /clear or a resume: the counts already started over, so the new session's first
// figures must not wipe what its first turn counted.
let isCountReset = false

/** How often the drawings are redrawn while nothing else moves: countdowns, the `┊` mark. */
const REDRAW_MS = 30_000
let redraw: { cancel: () => void } | null = null
/** While a turn runs, its timer in the pane counts seconds. */
const TICK_MS = 1_000
let tick: { cancel: () => void } | null = null

/** Re-read the session's figures; a new `startedAt` the mod did not see coming starts the counts over. */
const refreshUsage = async ($: Dollar) => {
  const u = await $.session.usage({ breakdown: 'summary' })
  const prompts = await $.session.turns()
  const before = await read($, usageAtom)
  const b = u.context.breakdown
  const view: UsageView = {
    startedAt: u.startedAt,
    tokens: u.context.tokens,
    window: u.context.window,
    rateLimits: u.rateLimits.map(r => ({ ...r })),
    costUsd: u.cost?.usd,
    prompts,
    breakdown: b ? toBreakdownView(b) : (before?.breakdown ?? null),
    // A full count stays until the next turn's figures replace it.
    breakdownDetail: 'summary',
  }
  await update($, usageAtom, () => view)
  // Counts older than the conversation: started over by /clear already (their `since` is the hook's
  // clock, a little before the engine's stamp), rebased onto it; or a conversation the mod did not
  // see start, counted afresh. Read from the counters themselves, so a second refresh is a no-op.
  if ((await read($, countersAtom)).since < u.startedAt) {
    if (isCountReset) await update($, countersAtom, c => ({ ...c, since: u.startedAt }))
    else {
      await update($, countersAtom, () => emptyCounters(u.startedAt))
      await update($, receiptAtom, () => null)
    }
  }
  if (before && before.startedAt !== u.startedAt) isCountReset = false
  return view
}

/** Usage figures and git, read after the hook that asked has handed back. */
const refreshLater = ($: Dollar, finish?: (view: UsageView) => Promise<void>) => {
  $.clock.after(0, () => {
    void (async () => {
      const view = await refreshUsage($)
      if (finish) await finish(view)
      const snap = await readGit($, view.startedAt)
      await update($, gitAtom, () => snap)
    })()
  })
}

/** Wires the session's events to the state atoms. */
export const registerTracking = (on: On): void => {
  // Cost when the running turn began, to tell what it added.
  let costAtTurnStart: number | undefined

  // The module's one session.start hook (an event takes one per module, and `$` never crosses an
  // import): it registers /sst too.
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // Immediate: the pane is most wanted while a turn runs; the answer only opens, closes or reads.
    await $.command.register({ name: 'sst', description: STR.commandDescription, immediate: true })
    const model = await $.session.model()
    await update($, liveAtom, l => ({ ...l, model: l.model ?? model }))
    const stored = await $.store.get(SETTINGS_KEY)
    await update($, settingsAtom, () => normalizeSettings(stored))
    redraw?.cancel()
    redraw = $.clock.every(REDRAW_MS, () => $.ui.invalidate('ui.render'))
    // A fresh process starts counting; a reloaded module keeps the counts of this session. A read
    // refused this early is tried again just after.
    await refreshUsage($).catch(() => undefined)
    refreshLater($)
    return r
  })

  // /clear (and a resume) starts the conversation over: so do the counts, at once.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    if (e.reason !== 'clear' && e.reason !== 'resume') return r
    const now = await $.clock.now()
    isCountReset = true
    await update($, countersAtom, () => emptyCounters(now))
    await update($, receiptAtom, () => null)
    tick?.cancel()
    tick = null
    await update($, liveAtom, l => ({ ...l, requests: 0, speed: null, isWorking: false }))
    // The old conversation's fill and cost no longer hold; the next figures bring the new ones.
    await update($, usageAtom, u => u && { ...u, tokens: undefined, costUsd: undefined, prompts: 0, breakdown: null })
    // The old conversation's files are not this one's.
    await update($, gitAtom, g => g && { ...g, sessionFiles: [] })
    const stored = await $.store.get(SETTINGS_KEY)
    await update($, settingsAtom, () => normalizeSettings(stored))
    // No measure follows a /clear: read the new conversation's figures and git once the engine has it.
    refreshLater($)
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    // After the measure is handed back, as every slow read.
    $.clock.after(0, () => void refreshUsage($))
    return r
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    await update($, liveAtom, l => ({
      ...l,
      model: e.model,
      // A model without effort sends none: the gauge goes.
      effort: e.effort === undefined ? null : String(e.effort),
      requests: l.requests + 1,
    }))
    const sentAt = await $.clock.now()
    let firstAt: number | null = null
    let stopAt: number | null = null
    const s = next(e)
    for await (const c of s) {
      if (c.kind === 'stop') stopAt = await $.clock.now()
      else if (firstAt === null && c.kind !== 'engine') firstAt = await $.clock.now()
      yield c
    }
    const result = await s.result
    const speed = stopAt === null ? null : stepSpeed(sentAt, firstAt, stopAt, result.usage?.output_tokens ?? null)
    if (speed) await update($, liveAtom, l => ({ ...l, speed }))
    return result
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.permission_mode) await update($, liveAtom, l => ({ ...l, permissionMode: e.permission_mode ?? null }))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    costAtTurnStart = (await read($, usageAtom))?.costUsd
    await update($, liveAtom, l => ({ ...l, isWorking: true }))
    await update($, receiptAtom, () => ({ isRunning: true, startedAt: now, durationMs: null, agents: 0, edits: 0, errors: 0, costAddedUsd: null }))
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    tick?.cancel()
    tick = null
    const now = await $.clock.now()
    await update($, liveAtom, l => ({ ...l, isWorking: false }))
    await update($, receiptAtom, rc => rc && { ...rc, isRunning: false, durationMs: now - rc.startedAt })
    // The figures and git come after the turn is handed back, never holding it.
    const costBefore = costAtTurnStart
    refreshLater($, async view => {
      const added = view.costUsd !== undefined && costBefore !== undefined ? view.costUsd - costBefore : null
      await update($, receiptAtom, rc => rc && { ...rc, costAddedUsd: added })
    })
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // A precompute installs nothing, a subagent compacts its own transcript, a skip compacts nothing.
    const isCompaction = e.trigger !== 'precompute' && !e.agentId && r.messages !== undefined
    if (isCompaction) {
      await update($, countersAtom, c => ({ ...c, compactions: c.compactions + 1 }))
      // The fill and breakdown were the old transcript's; between turns no measure follows to replace them.
      await update($, usageAtom, u => u && { ...u, tokens: undefined, breakdown: null })
      refreshLater($)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const isError = 'deny' in r ? true : r.isError === true
    await update($, countersAtom, c => ({ ...c, tools: { ...c.tools, [e.tool]: (c.tools[e.tool] ?? 0) + 1 } }))
    await update($, receiptAtom, rc =>
      // A denied or failed edit changed no file: an error, not an edit.
      rc?.isRunning ? { ...rc, edits: rc.edits + (EDIT_TOOLS.has(e.tool) && !isError ? 1 : 0), errors: rc.errors + (isError ? 1 : 0) } : rc,
    )
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    // A refused spawn starts nothing.
    if (r.deny !== undefined) return r
    await update($, countersAtom, c => ({ ...c, subagents: c.subagents + 1 }))
    await update($, receiptAtom, rc => (rc?.isRunning ? { ...rc, agents: rc.agents + 1 } : rc))
    return r
  })
}
