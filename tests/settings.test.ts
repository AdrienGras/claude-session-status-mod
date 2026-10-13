import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, normalizeSettings } from '../hooks/settings'

test('defaults: model, context and the 5h window, bars 10 wide', () => {
  expect(DEFAULT_SETTINGS).toEqual({ cardLines: ['model', 'context', 'five_hour'], barWidth: 10 })
  expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings('junk')).toEqual(DEFAULT_SETTINGS)
})

test('unknown and repeated lines dropped, order kept, width clamped', () => {
  expect(normalizeSettings({ cardLines: ['cost', 'bogus', 'cost'], barWidth: 99 })).toEqual({ cardLines: ['cost'], barWidth: 24 })
  expect(normalizeSettings({ cardLines: ['repo', 'model'], barWidth: 2 })).toEqual({ cardLines: ['repo', 'model'], barWidth: 6 })
  expect(normalizeSettings({ cardLines: [], barWidth: 7.6 })).toEqual({ cardLines: [], barWidth: 8 })
})

import { moveLine, resizeBars, settingsRows, toggleLine } from '../hooks/settings'

test('the settings list shows lines on, in order, then the lines off', () => {
  const rows = settingsRows({ cardLines: ['five_hour', 'model'], barWidth: 10 })
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
  expect(toggleLine(DEFAULT_SETTINGS, 'five_hour').cardLines).toEqual(['model', 'context'])
  expect(toggleLine(DEFAULT_SETTINGS, 'cost').cardLines).toEqual(['model', 'context', 'five_hour', 'cost'])
})

test('moving a line swaps it with its neighbour, the ends stay put', () => {
  expect(moveLine(DEFAULT_SETTINGS, 'context', -1).cardLines).toEqual(['context', 'model', 'five_hour'])
  expect(moveLine(DEFAULT_SETTINGS, 'model', -1).cardLines).toEqual(['model', 'context', 'five_hour'])
  expect(moveLine(DEFAULT_SETTINGS, 'five_hour', 1).cardLines).toEqual(['model', 'context', 'five_hour'])
  expect(moveLine(DEFAULT_SETTINGS, 'cost', 1).cardLines).toEqual(['model', 'context', 'five_hour'])
})

test('bar width steps within 6..24', () => {
  expect(resizeBars(DEFAULT_SETTINGS, 1).barWidth).toBe(11)
  expect(resizeBars({ ...DEFAULT_SETTINGS, barWidth: 24 }, 1).barWidth).toBe(24)
  expect(resizeBars({ ...DEFAULT_SETTINGS, barWidth: 6 }, -1).barWidth).toBe(6)
})
