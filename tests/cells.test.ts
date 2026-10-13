import { expect, test } from 'claude-code/testing'

import { cellWidth, takeCells, takeLastCells } from '../hooks/cells'

test('cells as a terminal draws them', () => {
  expect(cellWidth('abc')).toBe(3)
  // Emoji presentation is wide; the text-style glyphs the mod draws are not.
  expect(cellWidth('⛔')).toBe(2)
  expect(cellWidth('✓⚠◨▮▯┊│─╮≈→')).toBe(11)
  expect(cellWidth('⚠️')).toBe(2)
  expect(cellWidth('日本語')).toBe(6)
  expect(cellWidth('한국')).toBe(4)
  expect(cellWidth('ｆｕｌｌ')).toBe(8)
  // A combining accent and a joined emoji take no cells of their own.
  expect(cellWidth('é')).toBe(1)
  expect(cellWidth('👍')).toBe(2)
  expect(cellWidth('👨‍👩‍👧')).toBe(2)
  expect(cellWidth('')).toBe(0)
})

test('a head or a tail within so many cells, never half a wide glyph', () => {
  expect(takeCells('日本語', 5)).toBe('日本')
  expect(takeCells('ab⛔c', 3)).toBe('ab')
  expect(takeCells('abc', 9)).toBe('abc')
  expect(takeLastCells('日本語', 5)).toBe('本語')
  expect(takeLastCells('a/réunion.md', 6)).toBe('ion.md')
})
