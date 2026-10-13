import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { fakeEngine, startSession } from './engine'

const band = (surface: 'terminal' | 'desktop' = 'terminal', hasSurvey = false) => ({
  plugin: 'session-status',
  component: 'AbovePrompt' as const,
  props: { hasSurvey, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  surface,
})

// What the engine draws beneath, when the mod hands the band on.
const beneath = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['engine band'] }) as never)

test('the card shows the model, the context and the 5h window', async ($, on) => {
  fakeEngine(on, {
    rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(2.5 * 3_600_000).toISOString() }],
  })
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ text: /140k\/1M 14%/ })).toBeDefined()
  expect(await ui.find({ text: /5h/ })).toBeDefined()
  await ui.unmount()
})

test('no rate limits: no quota line', async ($, on) => {
  fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(band())
  expect(await ui.find({ text: /5h/ })).toBeUndefined()
  await ui.unmount()
})

test('other surfaces and surveys keep the engine band', async ($, on) => {
  fakeEngine(on)
  beneath(on)
  await startSession($)
  for (const b of [band('desktop'), band('terminal', true)]) {
    const ui = await $.ui.mount(b)
    expect(await ui.find({ text: /ctx/ })).toBeUndefined()
    expect(await ui.find({ text: /engine band/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the open button opens the side pane', async ($, on) => {
  const fake = fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'open' })
  expect(fake.openPanes.has('sst')).toBe(true)
  await ui.unmount()
})
