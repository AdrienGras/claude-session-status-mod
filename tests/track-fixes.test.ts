import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { answered, fakeEngine, modState, startSession } from './engine'

const messages = [{ role: 'user', text: 'x', toolUses: [] }]
const usage = { input_tokens: 1, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const engineTurns = (on: On) => {
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: {} }) as never)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.step', (async function* () {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: { ...usage, model: 'claude-opus-5-5' } }
    return { turnId: 'S', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { ...usage, model: 'claude-opus-5-5' } }
  }) as never)
}

const step = async ($: { turn: { step: (e: never) => AsyncIterable<unknown> & { result: Promise<unknown> } } }, effort?: string) => {
  const s = $.turn.step({ turnId: 'S', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(effort ? { effort } : {}) } as never)
  for await (const _ of s) void _
  await s.result
}

test('/clear starts the counts over at once', async ($, on) => {
  fakeEngine(on)
  engineTurns(on)
  on('session.compact', (_$, e) => ({ messages: e.messages }))
  await startSession($)
  await step($)
  await $.session.compact({ trigger: 'manual', messages } as never)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const mod = await modState($)
  expect(mod.counters.compactions).toBe(0)
  expect(mod.live.requests).toBe(0)
  expect(mod.receipt).toBe(null)
})

test('the first turn after /clear keeps its counts when the new figures arrive', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.tool.call({ tool: 'Read', input: {}, tool_use_id: 'u1' } as never)
  fake.usage = { ...fake.usage, startedAt: 1 }
  await $.session.measure({ ...fake.usage, changed: ['context'] } as never)
  await fake.clock.settle()
  expect((await modState($)).counters.tools).toEqual({ Read: 1 })
})

test('only real main-loop compactions are counted', async ($, on) => {
  fakeEngine(on)
  let answer: unknown = { messages }
  on('session.compact', () => answer as never)
  await startSession($)
  await $.session.compact({ trigger: 'precompute', messages } as never)
  await $.session.compact({ trigger: 'auto', messages, agentId: 'a1' } as never)
  answer = { skip: 'nothing to compact' }
  await $.session.compact({ trigger: 'auto', messages } as never)
  expect((await modState($)).counters.compactions).toBe(0)
})

test('a model without effort hides the gauge', async ($, on) => {
  fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await step($, 'high')
  expect((await modState($)).live.effort).toBe('high')
  await step($)
  expect((await modState($)).live.effort).toBe(null)
})

test('git runs after the turn is handed back, not inside it', async ($, on) => {
  const fake = fakeEngine(on)
  fake.repo = { root: '/work/x', remote: null }
  engineTurns(on)
  const runs: string[] = []
  on('process.run', (_$, e) => (runs.push(e.argv.join(' ')), { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await startSession($)
  await fake.clock.advance(10_000)
  runs.length = 0
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.turn.complete(answered('T1'))
  expect(runs).toEqual([])
  await fake.clock.advance(10)
  expect(runs.some(r => r.includes('status'))).toBe(true)
})

test('the drawings are refreshed while nothing else moves', async ($, on) => {
  const fake = fakeEngine(on)
  let redraws = 0
  on('ui.invalidate', () => ((redraws += 1), { value: undefined }))
  await startSession($)
  await fake.clock.advance(60_000)
  expect(redraws >= 2).toBe(true)
})

test('counts made after /clear survive a later module start (a reload)', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await fake.clock.set(1_000)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  // The engine stamps the new conversation after the session.end chain.
  fake.usage = { ...fake.usage, startedAt: 1_001 }
  await $.tool.call({ tool: 'Read', input: {}, tool_use_id: 'u1' } as never)
  await $.session.measure({ ...fake.usage, changed: ['context'] } as never)
  await fake.clock.settle()
  await startSession($)
  expect((await modState($)).counters.tools).toEqual({ Read: 1 })
})

test('/clear re-reads the figures and git for the new conversation', async ($, on) => {
  const fake = fakeEngine(on)
  fake.repo = { root: '/work/x', remote: null }
  engineTurns(on)
  const runs: string[] = []
  on('process.run', (_$, e) => (runs.push(e.argv.join(' ')), { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await startSession($)
  await fake.clock.settle()
  const calls = fake.usageCalls.length
  runs.length = 0
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  fake.usage = { ...fake.usage, startedAt: 1 }
  await fake.clock.settle()
  expect(fake.usageCalls.length > calls).toBe(true)
  // Within the git cache's TTL, but for a new conversation: read again.
  expect(runs.some(r => r.includes('status'))).toBe(true)
})

test('the redraw is armed even when the first usage read fails', async ($, on) => {
  const fake = fakeEngine(on)
  fake.usageFailures = 1
  let redraws = 0
  on('ui.invalidate', () => ((redraws += 1), { value: undefined }))
  await startSession($)
  await fake.clock.advance(60_000)
  expect(fake.usageCalls.length >= 2).toBe(true)
  expect(redraws >= 2).toBe(true)
})

test('a measure is handed back before the figures are re-read', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await fake.clock.settle()
  const calls = fake.usageCalls.length
  await $.session.measure({ ...fake.usage, changed: ['context'] } as never)
  expect(fake.usageCalls.length).toBe(calls)
  await fake.clock.settle()
  expect(fake.usageCalls.length).toBe(calls + 1)
})

test('while a turn runs, the drawings tick every second; after it, they rest', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  let redraws = 0
  on('ui.invalidate', () => ((redraws += 1), { value: undefined }))
  await startSession($)
  await fake.clock.settle()
  redraws = 0
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await fake.clock.advance(5_000)
  expect(redraws >= 4).toBe(true)
  await $.turn.complete(answered('T1'))
  redraws = 0
  await fake.clock.advance(5_000)
  expect(redraws).toBe(0)
})
