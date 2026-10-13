import { expect, test } from 'claude-code/testing'

import { fakeEngine, modState, startSession } from './engine'

const compaction = { trigger: 'auto', messages: [{ role: 'user', text: 'x', toolUses: [] }] } as never

test('a compaction is counted', async ($, on) => {
  fakeEngine(on)
  on('session.compact', (_$, e) => ({ messages: e.messages }))
  await startSession($)
  await $.session.compact(compaction)
  expect((await modState($)).counters.compactions).toBe(1)
})

test('an edit inside a turn counts as a tool call and on the receipt', async ($, on) => {
  fakeEngine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }) as never)
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.tool.call({ tool: 'Edit', input: {}, tool_use_id: 'u1' } as never)
  const mod = await modState($)
  expect(mod.counters.tools).toEqual({ Edit: 1 })
  expect(mod.receipt?.edits).toBe(1)
  expect(mod.live.isWorking).toBe(true)
})

test('a new session start (/clear) resets what the mod counted', async ($, on) => {
  const fake = fakeEngine(on)
  on('session.compact', (_$, e) => ({ messages: e.messages }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await startSession($)
  await $.session.compact(compaction)
  fake.usage = { ...fake.usage, startedAt: 5_000 }
  await $.session.measure({ ...fake.usage, changed: ['context'] } as never)
  await fake.clock.settle()
  expect((await modState($)).counters.compactions).toBe(0)
})

test('observing hooks hand back what is beneath unchanged', async ($, on) => {
  fakeEngine(on)
  const beneath = { result: { ok: 1 } }
  on('tool.call', () => beneath as never)
  await startSession($)
  expect(await $.tool.call({ tool: 'Read', input: {}, tool_use_id: 'u2' } as never)).toEqual(beneath)
})

test('/sst runs at once, even while a turn is running', async ($, on) => {
  const fake = fakeEngine(on)
  await startSession($)
  expect(fake.commandSpecs.find(c => c.name === 'sst')?.immediate).toBe(true)
})

test('a refused spawn starts no subagent', async ($, on) => {
  fakeEngine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ deny: 'not now' }) as never)
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.agent.spawn({ prompt: 'x', agentType: 'general-purpose' } as never)
  const mod = await modState($)
  expect(mod.counters.subagents).toBe(0)
  expect(mod.receipt?.agents).toBe(0)
})

test('a denied or failed edit is an error, not an edit', async ($, on) => {
  fakeEngine(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  let answer: unknown = { deny: 'declined' }
  on('tool.call', () => answer as never)
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.tool.call({ tool: 'Edit', input: {}, tool_use_id: 'u1' } as never)
  answer = { result: 'String to replace not found', isError: true }
  await $.tool.call({ tool: 'Edit', input: {}, tool_use_id: 'u2' } as never)
  const mod = await modState($)
  expect(mod.receipt?.edits).toBe(0)
  expect(mod.receipt?.errors).toBe(2)
})

test('after a compaction between turns, the old fill goes at once', async ($, on) => {
  const fake = fakeEngine(on, { context: { tokens: 850_000, window: 1_000_000, percent: 85 } })
  on('session.compact', (_$, e) => ({ messages: e.messages }))
  await startSession($)
  await fake.clock.settle()
  const hint = { plugin: 'session-status', component: 'PromptHint' as const, props: { isDraft: false, isWorking: false, hint: '?' }, surface: 'terminal' as const }
  const before = await $.ui.mount(hint)
  expect(await before.find({ text: /85%/ })).toBeDefined()
  await before.unmount()
  // The engine has no fill until the next response after a compaction.
  fake.usage = { ...fake.usage, context: { window: 1_000_000 } as never }
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'x', toolUses: [] }] } as never)
  await fake.clock.settle()
  const after = await $.ui.mount(hint)
  expect(await after.find({ text: /85%/ })).toBeUndefined()
  await after.unmount()
})
