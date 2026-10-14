import { expect, test } from 'claude-code/testing'

import { callCard, callDetail, endCard, keepCards, reconcile, spawnCard, stepCard, withCard } from '../hooks/agents'

const usage = (input_tokens: number, cache_read_input_tokens: number, cache_creation_input_tokens: number, output_tokens: number) => ({
  input_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  output_tokens,
})

test('a spawned card runs, with nothing measured yet', () => {
  expect(spawnCard('a1', 'Explore', 'find the auth code', 1_000)).toEqual({
    id: 'a1',
    type: 'Explore',
    task: 'find the auth code',
    startedAt: 1_000,
    endedAt: null,
    state: 'running',
    steps: 0,
    contextTokens: null,
    outputTokens: 0,
    calls: [],
  })
})

test('a step counts, sums output and takes the last context', () => {
  const c = stepCard(stepCard(spawnCard('a1', 'x', 't', 0), usage(1_000, 20_000, 500, 300)), usage(2_000, 21_000, 0, 200))
  expect(c.steps).toBe(2)
  expect(c.contextTokens).toBe(23_000)
  expect(c.outputTokens).toBe(500)
  const n = stepCard(c, null)
  expect(n.steps).toBe(3)
  expect(n.contextTokens).toBe(23_000)
  expect(n.outputTokens).toBe(500)
})

test('calls keep the last three, newest last', () => {
  let c = spawnCard('a1', 'x', 't', 0)
  for (const tool of ['Read', 'Grep', 'Bash', 'Edit']) c = callCard(c, tool, {})
  expect(c.calls.map((k) => k.tool)).toEqual(['Grep', 'Bash', 'Edit'])
})

test("a call's detail is its first telling field", () => {
  expect(callDetail({ file_path: '/w/a.ts' })).toBe('/w/a.ts')
  expect(callDetail({ command: 'npm test\nmore' })).toBe('npm test')
  expect(callDetail({ pattern: 'TODO', path: 'src' })).toBe('src')
  expect(callDetail({ url: 'https://x.dev' })).toBe('https://x.dev')
  expect(callDetail({ todos: [] })).toBe(null)
  expect(callDetail(null)).toBe(null)
  expect(callDetail({ file_path: 3 })).toBe(null)
})

test('an end sets the state once', () => {
  const c = spawnCard('a1', 'x', 't', 0)
  const done = endCard(c, { reason: 'answer', isAborted: false }, 5_000)
  expect(done.state).toBe('done')
  expect(done.endedAt).toBe(5_000)
  expect(endCard(c, { reason: 'aborted', isAborted: true }, 1).state).toBe('stopped')
  expect(endCard(c, { reason: 'answer', isAborted: true }, 1).state).toBe('stopped')
  expect(endCard(c, { reason: 'error', isAborted: false }, 1).state).toBe('failed')
  expect(endCard(done, { reason: 'error', isAborted: false }, 9_000)).toEqual(done)
})

test('a killed agent the list reports is ended', () => {
  const run = (id: string) => spawnCard(id, 'x', 't', 0)
  const out = reconcile(
    [run('a1'), run('a2'), run('a3'), run('a4')],
    [
      { id: 'a1', status: 'killed' },
      { id: 'a2', status: 'completed' },
      { id: 'a3', status: 'running' },
    ],
    9_000,
  )
  expect(out.map((c) => c.state)).toEqual(['stopped', 'done', 'running', 'running'])
  expect(out[0]?.endedAt).toBe(9_000)
  expect(out[1]?.endedAt).toBe(9_000)
})

test('a failed listed agent is failed', () => {
  const out = reconcile([spawnCard('a1', 'x', 't', 0)], [{ id: 'a1', status: 'failed' }], 7)
  expect(out[0]?.state).toBe('failed')
})

test('an unknown id changes nothing', () => {
  const a1 = spawnCard('a1', 'x', 't', 0)
  expect(withCard([a1], 'zz', (c) => ({ ...c, steps: 9 }))).toEqual([a1])
})

test('ten in parallel: every running one kept, three finished, running first', () => {
  const running = Array.from({ length: 10 }, (_, i) => spawnCard(`r${i + 1}`, 'x', 't', i + 1))
  const finished = [100, 200, 300, 400, 500].map((end) =>
    endCard(spawnCard(`f${end}`, 'x', 't', 0), { reason: 'answer', isAborted: false }, end),
  )
  const out = keepCards([...finished, ...running.slice().reverse()])
  expect(out.length).toBe(13)
  expect(out.slice(0, 10).map((c) => c.startedAt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect(out.slice(0, 10).every((c) => c.state === 'running')).toBe(true)
  expect(out.slice(10).map((c) => c.endedAt)).toEqual([500, 400, 300])
})
