import { expect, test } from 'claude-code/testing'

import { burnVerdict, computeBurn, contextTone, projectionText, projectionTone, readQuota, WINDOW_MS } from '../hooks/burn'

const NOW = 1_000_000_000
const H = 3_600_000
const SESSION = WINDOW_MS.five_hour
const WEEK = WINDOW_MS.seven_day
const near = (got: number, want: number, tol: number) => expect(Math.abs(got - want) <= tol).toBe(true)

test('window lengths', () => {
  expect(SESSION).toBe(5 * H)
  expect(WEEK).toBe(7 * 24 * H)
})

test('A: half the window, 20% used: projects 40%, 7h30 to spare', () => {
  const b = computeBurn(20, NOW + 2.5 * H, SESSION, NOW)!
  near(b.projection, 40, 0.01)
  near(b.elapsedFrac, 0.5, 0.001)
  near(b.juiceMs, 10 * H, 1000)
  near(b.marginMs, 7.5 * H, 1000)
  expect(b.isLowConfidence).toBe(false)
  expect(burnVerdict(b)).toBe('✓ +7h30')
  expect(projectionText(b)).toBe('→ 40%')
})

test('B: half the window, 70% used: hits the wall in 1h04', () => {
  const b = computeBurn(70, NOW + 2.5 * H, SESSION, NOW)!
  near(b.projection, 140, 0.01)
  near(b.juiceMs, 3_857_140, 1000)
  near(b.marginMs, 3_857_140 - 9_000_000, 1000)
  expect(burnVerdict(b)).toBe('⚠ wall 1h04')
})

test('C: early in the window the projection is low confidence', () => {
  const b = computeBurn(3, NOW + 0.95 * SESSION, SESSION, NOW)!
  near(b.elapsedFrac, 0.05, 0.001)
  near(b.projection, 60, 0.01)
  expect(b.isLowConfidence).toBe(true)
  expect(projectionText(b)).toBe('→ ~60%')
  expect(projectionTone(b)).toBe('inactive')
})

test('D: nothing used: infinite headroom', () => {
  const b = computeBurn(0, NOW + 2.5 * H, SESSION, NOW)!
  expect(b.projection).toBe(0)
  expect(b.juiceMs).toBe(Infinity)
  expect(burnVerdict(b)).toBe('✓ ∞')
})

test('E: saturated window reads as the limit', () => {
  const b = computeBurn(100, NOW + 2.5 * H, SESSION, NOW)!
  expect(b.juiceMs).toBe(0)
  near(b.marginMs, -9_000_000, 1000)
  expect(burnVerdict(b)).toBe('⛔ limit')
})

test('F: weekly window', () => {
  const b = computeBurn(23, NOW + WEEK / 2, WEEK, NOW)!
  near(b.projection, 46, 0.01)
  near(b.juiceMs, 1_012_382_610, 2000)
})

test('G: a reading from before its reset is stale, never projected', () => {
  expect(computeBurn(50, NOW - 10_000, SESSION, NOW)).toBeNull()
  expect(readQuota({ kind: 'five_hour', percentUsed: 80, resetsAt: new Date(NOW - 10_000).toISOString() }, NOW)).toBe('stale')
})

test('a reset more than a window ahead (a clock off) is no projection', () => {
  expect(computeBurn(1, NOW + SESSION + H, SESSION, NOW)).toBeNull()
  expect(readQuota({ kind: 'five_hour', percentUsed: 1, resetsAt: new Date(NOW + SESSION + H).toISOString() }, NOW)).toBeNull()
})

test('a window with a known length and reset reads as its burn; others as a plain gauge', () => {
  const r = readQuota({ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(NOW + 2.5 * H).toISOString() }, NOW)
  expect(r !== null && r !== 'stale' && Math.round(r.projection)).toBe(40)
  expect(readQuota({ kind: 'spend_limit', percentUsed: 112 }, NOW)).toBeNull()
})

test('huge projections are capped in text', () => {
  const b = computeBurn(99, NOW + 0.99 * SESSION, SESSION, NOW)!
  expect(projectionText(b)).toBe('→ ~>999%')
})

test('projection tones step at 80 and 130', () => {
  const at = (projection: number) => projectionTone({ ...computeBurn(10, NOW + 2.5 * H, SESSION, NOW)!, projection })
  expect(at(79)).toBe('success')
  expect(at(80)).toBe('warning')
  expect(at(129)).toBe('warning')
  expect(at(130)).toBe('error')
})

test('context tones step at 50 and 80', () => {
  expect(contextTone(49)).toBe('success')
  expect(contextTone(50)).toBe('warning')
  expect(contextTone(79)).toBe('warning')
  expect(contextTone(80)).toBe('error')
})
