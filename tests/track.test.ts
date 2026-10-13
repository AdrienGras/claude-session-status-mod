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
  expect((await modState($)).counters.compactions).toBe(0)
})

test('observing hooks hand back what is beneath unchanged', async ($, on) => {
  fakeEngine(on)
  const beneath = { result: { ok: 1 } }
  on('tool.call', () => beneath as never)
  await startSession($)
  expect(await $.tool.call({ tool: 'Read', input: {}, tool_use_id: 'u2' } as never)).toEqual(beneath)
})
