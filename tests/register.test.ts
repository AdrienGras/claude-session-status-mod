import { expect, test } from 'claude-code/testing'

import { fakeEngine, startSession, typed } from './engine'

test('/sst debug dumps the raw readings', async ($, on) => {
  fakeEngine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 20 }] })
  await startSession($)
  const out = await $.command.run(typed('sst', 'debug'))
  const text = 'text' in out ? String(out.text) : ''
  expect(text).toContain('"context"')
  expect(text).toContain('"rateLimits"')
  expect(text).toContain('five_hour')
})
