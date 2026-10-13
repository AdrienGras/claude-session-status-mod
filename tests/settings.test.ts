import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, normalizeSettings } from '../hooks/settings'

test('defaults: model, context and the 5h window, bars 10 wide, beside the hint', () => {
  expect(DEFAULT_SETTINGS).toEqual({ cardLines: ['model', 'context', 'five_hour'], barWidth: 10, hintLayout: 'inline' })
  expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings('junk')).toEqual(DEFAULT_SETTINGS)
})

test('unknown and repeated lines dropped, order kept, width clamped', () => {
  expect(normalizeSettings({ cardLines: ['cost', 'bogus', 'cost'], barWidth: 99 })).toEqual({ cardLines: ['cost'], barWidth: 24, hintLayout: 'inline' })
  expect(normalizeSettings({ cardLines: ['repo', 'model'], barWidth: 2 })).toEqual({ cardLines: ['repo', 'model'], barWidth: 6, hintLayout: 'inline' })
  expect(normalizeSettings({ cardLines: [], barWidth: 7.6 })).toEqual({ cardLines: [], barWidth: 8, hintLayout: 'inline' })
})

test('the layout is kept when known, beside the hint otherwise', () => {
  expect(normalizeSettings({ hintLayout: 'below' }).hintLayout).toBe('below')
  expect(normalizeSettings({ hintLayout: 'sideways' }).hintLayout).toBe('inline')
})

import { moveLine, resizeBars, settingsRows, toggleLayout, toggleLine } from '../hooks/settings'
import type { Settings } from '../types'

const BASE: Settings = { cardLines: ['model', 'context', 'five_hour'], barWidth: 10, hintLayout: 'inline' }

test('the settings list shows lines on, in order, then the lines off', () => {
  const rows = settingsRows({ ...BASE, cardLines: ['five_hour', 'model'] })
  expect(rows.map(r => [r.line, r.isOn])).toEqual([
    ['five_hour', true],
    ['model', true],
    ['context', false],
    ['seven_day', false],
    ['cost', false],
    ['repo', false],
  ])
})

test('toggling a line turns it off, or on at the end', () => {
  expect(toggleLine(BASE, 'five_hour').cardLines).toEqual(['model', 'context'])
  expect(toggleLine(BASE, 'cost').cardLines).toEqual(['model', 'context', 'five_hour', 'cost'])
})

test('moving a line swaps it with its neighbour, the ends stay put', () => {
  expect(moveLine(BASE, 'context', -1).cardLines).toEqual(['context', 'model', 'five_hour'])
  expect(moveLine(BASE, 'model', -1).cardLines).toEqual(['model', 'context', 'five_hour'])
  expect(moveLine(BASE, 'five_hour', 1).cardLines).toEqual(['model', 'context', 'five_hour'])
  expect(moveLine(BASE, 'cost', 1).cardLines).toEqual(['model', 'context', 'five_hour'])
})

test('bar width steps within 6..24', () => {
  expect(resizeBars(BASE, 1).barWidth).toBe(11)
  expect(resizeBars({ ...BASE, barWidth: 24 }, 1).barWidth).toBe(24)
  expect(resizeBars({ ...BASE, barWidth: 6 }, -1).barWidth).toBe(6)
})

test('the layout switches between beside the hint and a row of its own', () => {
  expect(toggleLayout(BASE).hintLayout).toBe('below')
  expect(toggleLayout(toggleLayout(BASE)).hintLayout).toBe('inline')
})
