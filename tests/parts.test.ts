import { expect, test } from 'claude-code/testing'

import { effortGauge, prettyModel } from '../hooks/parts'

const line = (parts: { text: string }[]) => parts.map(p => p.text).join('')

test('model ids read as their family and version', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(prettyModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(prettyModel('Opus 5.5')).toBe('Opus 5.5')
  expect(prettyModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(prettyModel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
})

test('effort as five notches, an unknown level as a word', () => {
  expect(line(effortGauge('high'))).toBe('effort ▮▮▮▯▯ high')
  expect(line(effortGauge('max'))).toBe('effort ▮▮▮▮▮ max')
  expect(line(effortGauge('42'))).toBe('effort 42')
})


