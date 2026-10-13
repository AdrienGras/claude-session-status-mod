// The repo section's readings: what the session API gives, and what only `git` can tell.
import type { FsStat, ProcessRunInit, ProcessRunResult, SessionRepo } from 'claude-code'
import type { GitSnapshot } from '../types'

/** `owner/repo` from an SSH, HTTPS or ssh:// remote; null when it does not read as one. */
export const parseRemote = (url: string | null): string | null => {
  const m = url?.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

export const parseShortstat = (out: string): { files: number; added: number; removed: number } => {
  const n = (re: RegExp) => Number(out.match(re)?.[1] ?? 0)
  return { files: n(/(\d+) files? changed/), added: n(/(\d+) insertions?\(\+\)/), removed: n(/(\d+) deletions?\(-\)/) }
}

/** `git rev-list --left-right --count @{u}...HEAD` prints `behind<TAB>ahead`. */
export const parseAheadBehind = (out: string): { ahead: number; behind: number } | null => {
  const m = out.trim().match(/^(\d+)\s+(\d+)$/)
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null
}

/** Paths from `git status --porcelain`; a rename reads as its destination. */
export const parsePorcelain = (out: string): string[] =>
  out
    .split('\n')
    .filter(line => line.length > 3)
    .map(line => {
      const path = line.slice(3)
      const dest = path.includes(' -> ') ? path.split(' -> ').pop()! : path
      return dest.replace(/^"(.*)"$/, '$1')
    })

/** The part of `$` the reader uses: the engine's, or a test's. */
export type GitDeps = {
  clock: { now: () => Promise<number> }
  session: { cwd: () => Promise<string>; repo: () => Promise<SessionRepo | null> }
  process: { run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult> }
  fs: { stat: (path: string) => Promise<FsStat> }
}

const TTL_MS = 5_000
/** Dirty paths looked at for the session's own files: a huge worktree is not walked whole. */
const MAX_STATS = 200

/** A reader that runs `git` at most once per TTL; the snapshot in between is the cached one. */
export const makeGitReader = (ttlMs = TTL_MS) => {
  let cached: { at: number; snap: GitSnapshot } | null = null

  return async ($: GitDeps, startedAt: number): Promise<GitSnapshot> => {
    const now = await $.clock.now()
    if (cached && now - cached.at < ttlMs) return cached.snap
    const cwd = await $.session.cwd()
    const info = await $.session.repo()
    const snap: GitSnapshot = {
      cwd,
      repo: parseRemote(info?.remote ?? null),
      branch: null,
      files: 0,
      added: 0,
      removed: 0,
      ahead: null,
      behind: null,
      sessionFiles: [],
    }
    if (info) {
      // In the session's folder, not `info.root`: that is the main working tree's, even from a
      // linked worktree, whose branch and changes are its own.
      const git = async (...args: string[]): Promise<string | null> => {
        try {
          const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 3_000 })
          return r.exitCode === 0 ? r.stdout : null
        } catch {
          return null
        }
      }
      const [top, branch, shortstat, aheadBehind, status] = await Promise.all([
        git('rev-parse', '--show-toplevel'),
        git('branch', '--show-current'),
        git('diff', '--shortstat', 'HEAD'),
        git('rev-list', '--left-right', '--count', '@{u}...HEAD'),
        // Read-only: never take the index lock while the person's own git runs.
        git('--no-optional-locks', 'status', '--porcelain'),
      ])
      snap.branch = branch?.trim() || null
      Object.assign(snap, parseShortstat(shortstat ?? ''))
      const ab = parseAheadBehind(aheadBehind ?? '')
      if (ab) Object.assign(snap, ab)
      // Porcelain paths are from the top of this worktree; without it they can't be looked at.
      const root = top?.trim()
      const paths = root ? parsePorcelain(status ?? '').slice(0, MAX_STATS) : []
      const fresh = await Promise.all(
        paths.map(async path => {
          try {
            return (await $.fs.stat(`${root}/${path}`)).mtimeMs >= startedAt
          } catch {
            return false // deleted or unreadable: not a file this session left behind
          }
        }),
      )
      snap.sessionFiles = paths.filter((_, i) => fresh[i])
    }
    cached = { at: now, snap }
    return snap
  }
}
