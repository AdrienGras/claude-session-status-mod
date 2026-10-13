import { expect, test } from 'claude-code/testing'

import { configTarget, fakeEngine, modState, paneTarget, startSession, typed } from './engine'

test('/sst config opens the settings pane', async ($, on) => {
  const fake = fakeEngine(on)
  await startSession($)
  await $.command.run(typed('sst', 'config'))
  expect(fake.openPanes.has('sst-config')).toBe(true)
})

test('the side pane has a way to the settings', async ($, on) => {
  const fake = fakeEngine(on)
  await startSession($)
  const ui = await $.ui.mount(paneTarget())
  await ui.press({ key: 'settings' })
  expect(fake.openPanes.has('sst-config')).toBe(true)
  await ui.unmount()
})

test('turning a line off is kept and survives a new session', async ($, on) => {
  fakeEngine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(9_000_000).toISOString() }] })
  await startSession($)
  const ui = await $.ui.mount(configTarget())
  expect(await ui.find({ text: /\[x\] 5h window/ })).toBeDefined()
  await ui.press({ key: 'line-five_hour' })
  expect((await modState($)).settings.cardLines).toEqual(['model', 'context'])
  await ui.unmount()
  await startSession($)
  expect((await modState($)).settings.cardLines).toEqual(['model', 'context'])
})

test('bars widen up to 24 and no further', async ($, on) => {
  fakeEngine(on)
  await startSession($)
  const ui = await $.ui.mount(configTarget())
  for (let i = 0; i < 20; i++) await ui.press({ key: 'wider' })
  expect((await modState($)).settings.barWidth).toBe(24)
  await ui.unmount()
})

test('the layout switch is kept', async ($, on) => {
  fakeEngine(on)
  await startSession($)
  const ui = await $.ui.mount(configTarget())
  expect(await ui.find({ text: /beside Claude Code's hint/ })).toBeDefined()
  await ui.press({ key: 'layout' })
  expect((await modState($)).settings.hintLayout).toBe('below')
  expect(await ui.find({ text: /own row/ })).toBeDefined()
  await ui.unmount()
})
