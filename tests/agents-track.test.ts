import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { answered, fakeEngine, paneTarget, startSession } from './engine'

const usage = { input_tokens: 1, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const engineTurns = (on: On) => {
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: {} }) as never)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.step', (async function* () {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: { ...usage, model: 'claude-haiku-5-5' } }
    return { turnId: 'S', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { ...usage, model: 'claude-haiku-5-5' } }
  }) as never)
}

type D = Parameters<TestBody>[0]

const spawn = ($: D) => $.agent.spawn({ prompt: 'p', description: 'find the auth code', subagentType: 'Explore' } as never)
const agentStep = async ($: D, agentId: string) => {
  const s = $.turn.step({ turnId: 'S', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId } as never)
  for await (const _ of s) void _
  await s.result
}
const agentCall = ($: D, agentId: string) =>
  $.tool.call({ tool: 'Read', input: { file_path: '/w/a.ts' }, tool_use_id: 'u1', agentId } as never)
const endAgent = ($: D, agentId = 'a1') => $.turn.complete({ ...answered('x'), agentId } as never)

const paneText = async ($: D) => {
  const ui = await $.ui.mount(paneTarget())
  return ui
}

test('a spawned subagent gets a running card', async ($, on) => {
  fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await spawn($)
  const ui = await paneText($)
  expect(await ui.find({ text: /Explore · find the auth code/ })).toBeDefined()
  expect(await ui.find({ text: /●/ })).toBeDefined()
  await ui.unmount()
})

test('its steps and calls fill the card; its end sets the state', async ($, on) => {
  fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await spawn($)
  await agentStep($, 'a1')
  await agentCall($, 'a1')
  await endAgent($)
  const ui = await paneText($)
  expect(await ui.find({ text: /1 step/ })).toBeDefined()
  expect(await ui.find({ text: /✓/ })).toBeDefined()
  await ui.press({ key: 'g-agent:a1' })
  expect(await ui.find({ text: /\/w\/a\.ts/ })).toBeDefined()
  await ui.unmount()
})

test('a refused spawn gets no card', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  fake.spawnAnswer = { deny: 'no' }
  await startSession($)
  await spawn($)
  const ui = await paneText($)
  expect(await ui.find({ text: /╭─ Agents/ })).toBeUndefined()
  await ui.unmount()
})

test('steps and calls of an unknown agent are ignored', async ($, on) => {
  fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await agentStep($, 'zz')
  await agentCall($, 'zz')
  const ui = await paneText($)
  expect(await ui.find({ text: /╭─ Agents/ })).toBeUndefined()
  await ui.unmount()
})

test('a killed agent stops running at the next read', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  await startSession($)
  await spawn($)
  fake.agents = [{ id: 'a1', status: 'killed', description: '', type: 'Explore' }]
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.turn.complete(answered('T1') as never)
  await fake.clock.settle()
  const ui = await paneText($)
  expect(await ui.find({ text: /■/ })).toBeDefined()
  expect(await ui.find({ text: /●/ })).toBeUndefined()
  await ui.unmount()
})

const countRedraws = (on: On) => {
  const count = { n: 0 }
  on('ui.invalidate', () => {
    count.n += 1
    return { value: undefined } as never
  })
  return count
}

test('/clear empties the cards and stops the tick', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  const redraws = countRedraws(on)
  await startSession($)
  await spawn($)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  await fake.clock.settle()
  const ui = await paneText($)
  expect(await ui.find({ text: /╭─ Agents/ })).toBeUndefined()
  await ui.unmount()
  redraws.n = 0
  await fake.clock.advance(5_000)
  expect(redraws.n).toBe(0)
})

test('a background agent keeps the tick after the main turn ends', async ($, on) => {
  const fake = fakeEngine(on)
  engineTurns(on)
  const redraws = countRedraws(on)
  await startSession($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await spawn($)
  await $.turn.complete(answered('T1') as never)
  await fake.clock.settle()
  redraws.n = 0
  await fake.clock.advance(3_000)
  expect(redraws.n).toBeGreaterThanOrEqual(2)
  await endAgent($)
  redraws.n = 0
  await fake.clock.advance(5_000)
  expect(redraws.n).toBe(0)
})
