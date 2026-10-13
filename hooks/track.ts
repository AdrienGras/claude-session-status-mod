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

/** Re-read the session's figures; a new `startedAt` (a /clear) starts the counts over. */
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
  if (before && before.startedAt !== u.startedAt) {
    await update($, countersAtom, () => emptyCounters(u.startedAt))
    await update($, receiptAtom, () => null)
  }
  return view
}

/** Wires the session's events to the state atoms. */
export const registerTracking = (on: On): void => {
  // Cost when the running turn began, to tell what it added.
  let costAtTurnStart: number | undefined

  // The module's one session.start hook (an event takes one per module, and `$` never crosses an
  // import): it registers /sst too.
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'sst', description: STR.commandDescription })
    const model = await $.session.model()
    await update($, liveAtom, l => ({ ...l, model: l.model ?? model }))
    const stored = await $.store.get(SETTINGS_KEY)
    await update($, settingsAtom, () => normalizeSettings(stored))
    const view = await refreshUsage($)
    await update($, countersAtom, () => emptyCounters(view.startedAt))
    const snap = await readGit($, view.startedAt)
    await update($, gitAtom, () => snap)
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    await refreshUsage($)
    return r
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    await update($, liveAtom, l => ({
      ...l,
      model: e.model,
      effort: e.effort === undefined ? l.effort : String(e.effort),
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
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const now = await $.clock.now()
    const view = await refreshUsage($)
    await update($, liveAtom, l => ({ ...l, isWorking: false }))
    await update($, receiptAtom, rc =>
      rc && {
        ...rc,
        isRunning: false,
        durationMs: now - rc.startedAt,
        costAddedUsd: view.costUsd !== undefined && costAtTurnStart !== undefined ? view.costUsd - costAtTurnStart : null,
      },
    )
    const snap = await readGit($, view.startedAt)
    await update($, gitAtom, () => snap)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    await update($, countersAtom, c => ({ ...c, compactions: c.compactions + 1 }))
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const isError = 'deny' in r ? true : r.isError === true
    await update($, countersAtom, c => ({ ...c, tools: { ...c.tools, [e.tool]: (c.tools[e.tool] ?? 0) + 1 } }))
    await update($, receiptAtom, rc =>
      rc?.isRunning ? { ...rc, edits: rc.edits + (EDIT_TOOLS.has(e.tool) ? 1 : 0), errors: rc.errors + (isError ? 1 : 0) } : rc,
    )
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await update($, countersAtom, c => ({ ...c, subagents: c.subagents + 1 }))
    await update($, receiptAtom, rc => (rc?.isRunning ? { ...rc, agents: rc.agents + 1 } : rc))
    return r
  })
}
