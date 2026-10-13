import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { fakeEngine, startSession } from './engine'

const hint = (surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'session-status',
  component: 'PromptHint' as const,
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  surface,
})

const beneath = (on: On) => {
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Text', props: {}, children: ['engine hint'] }) as never)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['engine band'] }) as never)
}

test('the status sits under the prompt, the engine hint kept at its left', async ($, on) => {
  fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(hint())
  expect(await ui.find({ text: /\? for shortcuts/ })).toBeDefined()
  expect(await ui.find({ text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ text: /14%/ })).toBeDefined()
  await ui.unmount()
})

test('nothing is drawn above the prompt any more', async ($, on) => {
  fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount({
    plugin: 'session-status',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
    surface: 'terminal',
  })
  expect(await ui.find({ text: /engine band/ })).toBeDefined()
  await ui.unmount()
})

test('other surfaces keep the engine hint', async ($, on) => {
  fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(hint('desktop'))
  expect(await ui.find({ text: /engine hint/ })).toBeDefined()
  await ui.unmount()
})

test('the open mark opens the side pane', async ($, on) => {
  const fake = fakeEngine(on)
  beneath(on)
  await startSession($)
  const ui = await $.ui.mount(hint())
  expect((await ui.find({ key: 'open' }))?.props.label).toBe('◨')
  await ui.press({ key: 'open' })
  expect(fake.openPanes.has('sst')).toBe(true)
  await ui.unmount()
})
