import { expect, test } from 'claude-code/testing'

import { fmtClock, fmtDur, fmtElapsed, fmtTokensFine, fmtTokens, fmtUsd } from '../hooks/format'

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
  expect(fmtTokens(1_000)).toBe('1k')
  // Under a thousand, the count itself: never `0k` for a 300-token tool.
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(300)).toBe('300')
  expect(fmtTokens(0)).toBe('0')
  // What rounds to a thousand k is a million.
  expect(fmtTokens(999_700)).toBe('1M')
})

test('dollars: cents below 100, whole above', () => {
  expect(fmtUsd(4.823)).toBe('$4.82')
  expect(fmtUsd(104.4)).toBe('$104')
})

test('clock time is local HH:MM', () => {
  const at = new Date(2026, 9, 13, 17, 40).getTime()
  expect(fmtClock(at)).toBe('17:40')
})

import { fmtWhen } from '../hooks/format'

test('a reset reads as a clock time today, tomorrow, or a date beyond', () => {
  const now = new Date(2026, 9, 13, 19, 48).getTime()
  expect(fmtWhen(new Date(2026, 9, 13, 23, 50).getTime(), now)).toBe('23:50')
  expect(fmtWhen(new Date(2026, 9, 14, 17, 0).getTime(), now)).toBe('tomorrow 17:00')
  expect(fmtWhen(new Date(2026, 9, 15, 17, 0).getTime(), now)).toBe('Oct 15 17:00')
})

test('card figures keep the seconds and the first decimal', () => {
  expect(fmtElapsed(48_000)).toBe('48s')
  expect(fmtElapsed(72_000)).toBe('1m12s')
  expect(fmtElapsed(125_000)).toBe('2m05s')
  expect(fmtElapsed(4 * H + 36 * 60_000)).toBe('4h36')
  expect(fmtTokensFine(3_100)).toBe('3.1k')
  expect(fmtTokensFine(24_000)).toBe('24k')
  expect(fmtTokensFine(900)).toBe('900')
})
