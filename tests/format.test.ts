import { expect, test } from 'claude-code/testing'

import { fmtClock, fmtDur, fmtTokens, fmtUsd } from '../hooks/format'

const H = 3_600_000

test('durations read like burn-bar.py, days as d', () => {
  expect(fmtDur(30_000)).toBe('<1m')
  expect(fmtDur(89_000)).toBe('1m')
  expect(fmtDur(90_000)).toBe('2m')
  expect(fmtDur(H)).toBe('1h')
  expect(fmtDur(4 * H + 36 * 60_000)).toBe('4h36')
  expect(fmtDur(270_000_000)).toBe('3d3h')
  expect(fmtDur(172_800_000)).toBe('2d')
  expect(fmtDur(-10_000)).toBe('<1m')
  expect(fmtDur(Infinity)).toBe('∞')
})

test('token counts in k and M', () => {
  expect(fmtTokens(140_000)).toBe('140k')
  expect(fmtTokens(1_000_000)).toBe('1M')
  expect(fmtTokens(1_500_000)).toBe('1.5M')
  expect(fmtTokens(999)).toBe('1k')
  expect(fmtTokens(0)).toBe('0k')
})

test('dollars: cents below 100, whole above', () => {
  expect(fmtUsd(4.823)).toBe('$4.82')
  expect(fmtUsd(104.4)).toBe('$104')
})

test('clock time is local HH:MM', () => {
  const at = new Date(2026, 9, 13, 17, 40).getTime()
  expect(fmtClock(at)).toBe('17:40')
})
