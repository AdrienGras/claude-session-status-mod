import type { Register } from 'claude-code'

import { S } from './strings'

export const register: Register = on => {
  // Last raw readings the engine handed us, for `/sst debug`.
  let effort: string | null = null
  let permissionMode: string | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sst', description: S.commandDescription })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && e.effort !== undefined) effort = String(e.effort)
    return yield* next(e)
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    permissionMode = e.permission_mode ?? null
    return next(e)
  })

  on('command.run', { command: 'sst' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'debug') {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const model = await $.session.model()
      const breakdown = usage.context.breakdown
      const dump = {
        model,
        effort,
        permissionMode,
        rateLimitKinds: usage.rateLimits.map(r => r.kind),
        ...usage,
        // The grid is /context's drawing, not a reading: left out to keep the dump short.
        context: { ...usage.context, breakdown: breakdown && { ...breakdown, gridRows: undefined } },
      }
      return { text: JSON.stringify(dump, null, 2) }
    }
    return { text: '' }
  })
}
