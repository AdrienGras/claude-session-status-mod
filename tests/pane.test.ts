import { expect, test } from 'claude-code/testing'

import { fakeEngine, paneTarget, startSession, typed } from './engine'

const H = 3_600_000

test('the docked pane shows its sections', async ($, on) => {
  const fake = fakeEngine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(2.5 * H).toISOString() }], cost: { usd: 1.2 } })
  await startSession($)
  await fake.clock.settle() // git is read after session.start hands back
  const ui = await $.ui.mount(paneTarget())
  for (const title of ['Opus 5\\.5', 'Context', 'Quotas', 'Session', 'Repo']) expect(await ui.find({ text: new RegExp(`╭─ ${title}`) })).toBeDefined()
  await ui.unmount()
})

test('no rate limits: no quotas section', async ($, on) => {
  fakeEngine(on)
  await startSession($)
  const ui = await $.ui.mount(paneTarget())
  expect(await ui.find({ text: /╭─ Quotas/ })).toBeUndefined()
  await ui.unmount()
})

test('a full count runs on the recount button only', async ($, on) => {
  const fake = fakeEngine(on)
  await startSession($)
  const ui = await $.ui.mount(paneTarget())
  const isFull = (c: unknown) => (c as { breakdown?: string } | undefined)?.breakdown === 'full'
  expect(fake.usageCalls.some(isFull)).toBe(false)
  await ui.press({ key: 'recount' })
  expect(fake.usageCalls.some(isFull)).toBe(true)
  await ui.unmount()
})

test('compact asks first, then runs /compact', async ($, on) => {
  fakeEngine(on)
  const ran: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const question = String(e.questions[0]?.question)
    return { result: { questions: [], answers: { [question]: 'Compact' } } } as never
  })
  on('command.run', { command: 'compact' }, (_$, e) => (ran.push(e.command), { text: '' }))
  await startSession($)
  const ui = await $.ui.mount(paneTarget())
  await ui.press({ key: 'compact' })
  expect(ran).toEqual(['compact'])
  await ui.unmount()
})

test('/sst toggles the pane', async ($, on) => {
  const fake = fakeEngine(on)
  await startSession($)
  await $.command.run(typed('sst'))
  expect(fake.openPanes.has('sst')).toBe(true)
  await $.command.run(typed('sst'))
  expect(fake.openPanes.has('sst')).toBe(false)
})
