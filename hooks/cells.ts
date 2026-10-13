// Text measured in terminal cells, as the terminal draws it: an emoji or a CJK character takes two,
// a combining accent none. The pane's frame and the status line's budget count in these.

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null

/** User-perceived characters: an accent with its letter, a joined emoji as one. */
const graphemes = (text: string): string[] => (segmenter ? Array.from(segmenter.segment(text), s => s.segment) : [...text])

/** East Asian Wide and Fullwidth blocks (Hangul, CJK, kana, fullwidth forms). */
const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
]

const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u
const ZERO = /^[\p{Mn}\p{Me}\p{Cc}​-‏︀-️]/u

const graphemeCells = (g: string): number => {
  if (EMOJI.test(g)) return 2
  if (ZERO.test(g)) return 0
  const cp = g.codePointAt(0)!
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

export const cellWidth = (text: string): number => graphemes(text).reduce((a, g) => a + graphemeCells(g), 0)

/** The longest head of `text` within `max` cells. */
export const takeCells = (text: string, max: number): string => {
  let used = 0
  let out = ''
  for (const g of graphemes(text)) {
    const w = graphemeCells(g)
    if (used + w > max) break
    used += w
    out += g
  }
  return out
}

/** The longest tail of `text` within `max` cells. */
export const takeLastCells = (text: string, max: number): string => {
  let used = 0
  let out = ''
  for (const g of graphemes(text).reverse()) {
    const w = graphemeCells(g)
    if (used + w > max) break
    used += w
    out = g + out
  }
  return out
}
