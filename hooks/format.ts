// Compact figures for narrow cells: durations, token counts, dollars, clock time.

/** `<1m`, `42m`, `1h`, `4h36`, `3d3h`, `2d`, `∞`; negative reads as `<1m`. */
export const fmtDur = (ms: number): string => {
  if (ms === Infinity) return '∞'
  const s = Math.floor(Math.max(0, ms) / 1000)
  if (s < 60) return '<1m'
  const minutes = Math.round(s / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`
  const days = Math.floor(hours / 24)
  const hrs = hours % 24
  return hrs ? `${days}d${hrs}h` : `${days}d`
}

/** `300`, `140k`, `1M`, `1.5M`. */
export const fmtTokens = (n: number): string => {
  if (n < 1_000) return `${Math.round(n)}`
  if (Math.round(n / 1000) < 1_000) return `${Math.round(n / 1000)}k`
  return `${Math.round(n / 100_000) / 10}M`
}

/** `48s`, `1m12s`, `12m05s`; an hour and more read as `fmtDur`. */
export const fmtElapsed = (ms: number): string => {
  const s = Math.round(Math.max(0, ms) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3_600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
  return fmtDur(ms)
}

/** `300`, `3.1k` below ten thousand, else as `fmtTokens`. */
export const fmtTokensFine = (n: number): string =>
  n >= 1_000 && n < 9_950 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : fmtTokens(n)

/** `$4.82` below a hundred, `$104` above. */
export const fmtUsd = (usd: number): string => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/** Local `HH:MM`. */
export const fmtClock = (epochMs: number): string => {
  const d = new Date(epochMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A moment to come: `23:50` today, `tomorrow 17:00`, then `Oct 15 17:00`. */
export const fmtWhen = (epochMs: number, nowMs: number): string => {
  const at = new Date(epochMs)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(new Date(nowMs))) / 86_400_000)
  if (days <= 0) return fmtClock(epochMs)
  if (days === 1) return `tomorrow ${fmtClock(epochMs)}`
  return `${MONTHS[at.getMonth()]} ${at.getDate()} ${fmtClock(epochMs)}`
}
