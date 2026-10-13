import { expect, test } from 'claude-code/testing'

import { costRates, stepSpeed } from '../hooks/session'

const H = 3_600_000

test('a request speed: time to first piece, then output tokens per second', () => {
  expect(stepSpeed(0, 800, 2_800, 84)).toEqual({ ttftMs: 800, tokPerS: 42 })
  expect(stepSpeed(0, null, 2_800, 84)).toBe(null)
  expect(stepSpeed(0, 800, 800, 84)).toEqual({ ttftMs: 800, tokPerS: null })
  expect(stepSpeed(0, 800, 2_800, null)).toEqual({ ttftMs: 800, tokPerS: null })
})

test('cost per hour and per prompt, or nothing when it would be made up', () => {
  const r = costRates(4.8, 0, 2 * H, 24)
  expect(Math.abs(r.perHour! - 2.4) < 1e-9).toBe(true)
  expect(Math.abs(r.perPrompt! - 0.2) < 1e-9).toBe(true)
  expect(costRates(undefined, 0, 2 * H, 24)).toEqual({ perHour: null, perPrompt: null })
  expect(costRates(4.8, 0, 30_000, 0)).toEqual({ perHour: null, perPrompt: null })
})
