import { expect, test } from 'claude-code/testing'

import { burnBar, lineBar, segmentBar } from '../hooks/bars'
import { computeBurn, WINDOW_MS } from '../hooks/burn'
import type { Segment } from '../types'

const text = (cells: { text: string }[]) => cells.map(c => c.text).join('')

test('a thin bar: a line for the filled part, a dim track for the rest', () => {
  const cells = lineBar(0.14, 10, 'success')
  expect(cells.length).toBe(10)
  expect(text(cells)).toBe('━─────────')
  expect(cells[0]?.color).toBe('success')
  expect(cells[2]?.role).toBe('empty')
  expect(cells[2]?.color).toBe('subtle')
})

test('a half cell or more shows as a half line', () => {
  expect(text(lineBar(0.16, 10, 'success'))).toBe('━╸────────')
})

test('an overflowing or empty bar stays within its width', () => {
  expect(text(lineBar(1.12, 10, 'error'))).toBe('━━━━━━━━━━')
  expect(text(lineBar(0, 10, 'success'))).toBe('──────────')
  expect(text(lineBar(-1, 4, 'success'))).toBe('────')
})

test('the burn bar marks where the window says you should be', () => {
  const NOW = 1_000_000_000
  const b = computeBurn(20, NOW + 2.5 * 3_600_000, WINDOW_MS.five_hour, NOW)!
  const cells = burnBar(b, 10)
  expect(text(cells)).toBe('━━───┊────')
  expect(cells[5]?.role).toBe('marker')
  expect(cells[5]?.color).toBe('text')
  expect(cells[0]?.color).toBe('success')
})

const seg = (tokens: number, color: string, kind: Segment['kind'] = 'used'): Segment => ({ label: color, tokens, color, kind })

test('segments share the bar in proportion, free space left empty', () => {
  const cells = segmentBar([seg(60_000, 'claude'), seg(40_000, 'warning')], 100_000, 10)
  expect(cells.filter(c => c.color === 'claude').length).toBe(6)
  expect(cells.filter(c => c.color === 'warning').length).toBe(4)
  const withFree = segmentBar([seg(140_000, 'claude'), seg(860_000, 'promptBorder', 'free')], 1_000_000, 10)
  expect(withFree.length).toBe(10)
  expect(text(withFree)).toBe('━─────────')
})

test('a segmented bar always spans its width', () => {
  const odd = [seg(1, 'a'), seg(1, 'b'), seg(1, 'c')]
  expect(segmentBar(odd, 3, 7).length).toBe(7)
  expect(segmentBar([], 0, 5).length).toBe(5)
})
