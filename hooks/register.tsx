import type { Register } from 'claude-code'
import { atom, read } from 'claude-code'

import { EMPTY_LIVE, emptyCounters, INITIAL_SETTINGS } from './state'
import type { GitSnapshot, Receipt } from '../types'
import { registerTracking } from './track'

const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const countersAtom = atom({ plugin: 'session-status', key: 'counters' } as const, emptyCounters(0))
const receiptAtom = atom({ plugin: 'session-status', key: 'receipt' } as const, null as Receipt | null)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

export const register: Register = on => {
  registerTracking(on)

  on('command.run', { command: 'sst' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'debug') {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const live = await read($, liveAtom)
      const breakdown = usage.context.breakdown
      const dump = {
        model: await $.session.model(),
        effort: live.effort,
        permissionMode: live.permissionMode,
        rateLimitKinds: usage.rateLimits.map(r => r.kind),
        ...usage,
        // The grid is /context's drawing, not a reading: left out to keep the dump short.
        context: { ...usage.context, breakdown: breakdown && { ...breakdown, gridRows: undefined } },
        // What the mod holds itself.
        mod: {
          live,
          counters: await read($, countersAtom),
          receipt: await read($, receiptAtom),
          git: await read($, gitAtom),
          settings: await read($, settingsAtom),
        },
      }
      return { text: JSON.stringify(dump, null, 2) }
    }
    return { text: '' }
  })
}
