import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from '../hooks/settings'

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

test('settings round-trip through the store', async () => {
  const kept = new Map<string, unknown>()
  const deps = { store: { get: async (k: string) => kept.get(k), set: async (k: string, v: unknown) => void kept.set(k, v) } }
  expect(await loadSettings(deps)).toEqual(DEFAULT_SETTINGS)
  await saveSettings(deps, { cardLines: ['cost'], barWidth: 12 })
  expect(await loadSettings(deps)).toEqual({ cardLines: ['cost'], barWidth: 12 })
})
