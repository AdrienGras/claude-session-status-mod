import { expect, test } from 'claude-code/testing'

import type { GitDeps } from '../hooks/git'
import { makeGitReader, parseAheadBehind, parsePorcelain, parseRemote, parseShortstat } from '../hooks/git'

test('owner/repo from SSH, HTTPS and ssh:// remotes', () => {
  expect(parseRemote('git@github.com:AdrienGras/x.git')).toBe('AdrienGras/x')
  expect(parseRemote('https://github.com/AdrienGras/x')).toBe('AdrienGras/x')
  expect(parseRemote('https://github.com/AdrienGras/x.git')).toBe('AdrienGras/x')
  expect(parseRemote('ssh://git@host:22/o/r.git')).toBe('o/r')
  expect(parseRemote(null)).toBe(null)
  expect(parseRemote('nonsense')).toBe(null)
})

test('shortstat, empty or partial', () => {
  expect(parseShortstat(' 3 files changed, 42 insertions(+), 7 deletions(-)\n')).toEqual({ files: 3, added: 42, removed: 7 })
  expect(parseShortstat(' 1 file changed, 1 deletion(-)')).toEqual({ files: 1, added: 0, removed: 1 })
  expect(parseShortstat('')).toEqual({ files: 0, added: 0, removed: 0 })
})

test('ahead/behind from rev-list --left-right', () => {
  expect(parseAheadBehind('0\t2\n')).toEqual({ ahead: 2, behind: 0 })
  expect(parseAheadBehind('')).toBe(null)
})

test('porcelain -z paths, as written: renames to their destination, no quoting', () => {
  // Real git 2.43 output: a rename (destination, then source), non-ASCII, quotes, an arrow in a name.
  const out = 'R  mo -> ved.txt\0old.txt\0?? réunion.md\0?? with "q".txt\0 M hooks/a.ts\0'
  expect(parsePorcelain(out)).toEqual(['mo -> ved.txt', 'réunion.md', 'with "q".txt', 'hooks/a.ts'])
  expect(parsePorcelain('')).toEqual([])
  // A rename in the worktree column (after `git add -N`) carries its source too.
  expect(parsePorcelain(' R b.txt\0a.txt\0?? c.txt\0')).toEqual(['b.txt', 'c.txt'])
})

type Git = Record<string, { exitCode: number; stdout: string }>

const deps = (repo: { root: string; remote: string | null } | null, git: Git, mtimes: Record<string, number> = {}): GitDeps => {
  let now = 0
  return {
    clock: { now: async () => (now += 1) },
    session: { cwd: async () => '/work/x', repo: async () => repo && { ...repo, internal: false, name: null } },
    process: {
      run: async argv => ({
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
        ...(git[argv.slice(1).join(' ')] ?? { exitCode: 128, stdout: '' }),
      }),
    },
    fs: {
      stat: async path => {
        const m = mtimes[path]
        if (m === undefined) throw new Error('missing')
        return { kind: 'file', size: 1, mtimeMs: m, isLink: false }
      },
    },
  }
}

test('outside a repo: the folder alone, nothing invented', async () => {
  const snap = await makeGitReader()(deps(null, {}), 0)
  expect(snap).toEqual({ cwd: '/work/x', repo: null, branch: null, files: null, added: null, removed: null, ahead: null, behind: null, sessionFiles: [] })
})

test('in a repo without upstream: no ahead/behind; session files by mtime', async () => {
  const d = deps(
    { root: '/work/x', remote: 'git@github.com:AdrienGras/x.git' },
    {
      'rev-parse --show-toplevel': { exitCode: 0, stdout: '/work/x\n' },
      'branch --show-current': { exitCode: 0, stdout: 'main\n' },
      'diff --shortstat HEAD': { exitCode: 0, stdout: ' 2 files changed, 5 insertions(+), 1 deletion(-)\n' },
      '--no-optional-locks status --porcelain -z': { exitCode: 0, stdout: ' M old.ts\0 M fresh.ts\0' },
    },
    { '/work/x/old.ts': 100, '/work/x/fresh.ts': 2_000 },
  )
  const snap = await makeGitReader()(d, 1_000)
  expect(snap.repo).toBe('AdrienGras/x')
  expect(snap.branch).toBe('main')
  expect([snap.files, snap.added, snap.removed]).toEqual([2, 5, 1])
  expect([snap.ahead, snap.behind]).toEqual([null, null])
  expect(snap.sessionFiles).toEqual(['fresh.ts'])
})

test('git that cannot run reads as no readings', async () => {
  const d = deps({ root: '/work/x', remote: null }, {})
  d.process.run = async () => {
    throw new Error('ENOENT')
  }
  const snap = await makeGitReader()(d, 0)
  expect([snap.branch, snap.ahead, snap.files]).toEqual([null, null, null])
})

test('readings are cached within the TTL', async () => {
  let runs = 0
  const d = deps({ root: '/work/x', remote: null }, {})
  const run = d.process.run
  d.process.run = async (argv, init) => ((runs += 1), run(argv, init))
  const read = makeGitReader(5_000)
  await read(d, 0)
  const first = runs
  await read(d, 0)
  expect(runs).toBe(first)
})

test('status never takes the index lock', async () => {
  const seen: string[] = []
  const d = deps({ root: '/work/x', remote: null }, {})
  const run = d.process.run
  d.process.run = async (argv, init) => (seen.push(argv.join(' ')), run(argv, init))
  await makeGitReader()(d, 0)
  expect(seen).toContain('git --no-optional-locks status --porcelain -z')
})

test('in a linked worktree, git runs in the session folder and paths join its own top', async () => {
  const cwds = new Set<string | undefined>()
  const d = deps(
    // The API's root is the main working tree's, even from a linked worktree.
    { root: '/work/main', remote: null },
    {
      'rev-parse --show-toplevel': { exitCode: 0, stdout: '/work/wt\n' },
      'branch --show-current': { exitCode: 0, stdout: 'feature\n' },
      '--no-optional-locks status --porcelain -z': { exitCode: 0, stdout: ' M edited.ts\0' },
    },
    { '/work/wt/edited.ts': 2_000 },
  )
  d.session.cwd = async () => '/work/wt/sub'
  const run = d.process.run
  d.process.run = async (argv, init) => (cwds.add(init?.cwd), run(argv, init))
  const snap = await makeGitReader()(d, 1_000)
  expect([...cwds]).toEqual(['/work/wt/sub'])
  expect(snap.branch).toBe('feature')
  expect(snap.sessionFiles).toEqual(['edited.ts'])
})

test('a diff git could not read is unknown, never zero', async () => {
  // A fresh `git init` with files: the branch reads, `diff HEAD` exits 128 (no HEAD yet).
  const d = deps({ root: '/work/x', remote: null }, { 'branch --show-current': { exitCode: 0, stdout: 'main\n' } })
  const snap = await makeGitReader()(d, 0)
  expect(snap.branch).toBe('main')
  expect([snap.files, snap.added, snap.removed]).toEqual([null, null, null])
})

test('a clean tree reads as a known zero', async () => {
  const d = deps({ root: '/work/x', remote: null }, { 'diff --shortstat HEAD': { exitCode: 0, stdout: '' } })
  const snap = await makeGitReader()(d, 0)
  expect([snap.files, snap.added, snap.removed]).toEqual([0, 0, 0])
})

test('a new conversation reads again within the TTL', async () => {
  let runs = 0
  const d = deps({ root: '/work/x', remote: null }, {})
  const run = d.process.run
  d.process.run = async (argv, init) => ((runs += 1), run(argv, init))
  const read = makeGitReader(5_000)
  await read(d, 0)
  const first = runs
  await read(d, 1)
  expect(runs > first).toBe(true)
})
