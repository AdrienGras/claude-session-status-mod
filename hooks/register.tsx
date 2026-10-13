import type { Register } from 'claude-code'
import { atom, read } from 'claude-code'

import { EMPTY_LIVE, emptyCounters, INITIAL_SETTINGS } from './state'
import type { GitSnapshot, Receipt } from '../types'
import { registerMinibar } from './minibar'
import { PANE_ID, registerPane } from './pane'
import { CONFIG_PANE_ID, registerSettingsView } from './settings-view'
import { debugReport } from './debug'
import { normalizeSettings } from './settings'
import { S } from './strings'
import { registerTracking } from './track'

const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const countersAtom = atom({ plugin: 'session-status', key: 'counters' } as const, emptyCounters(0))
const receiptAtom = atom({ plugin: 'session-status', key: 'receipt' } as const, null as Receipt | null)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

export const register: Register = on => {
  registerTracking(on)
  registerMinibar(on)
  registerPane(on)
  registerSettingsView(on)

  on('command.run', { command: 'sst' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'debug') {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const dump = debugReport(usage, {
        live: await read($, liveAtom),
        counters: await read($, countersAtom),
        receipt: await read($, receiptAtom),
        git: await read($, gitAtom),
        settings: normalizeSettings(await read($, settingsAtom)),
      })
      return { text: JSON.stringify(dump, null, 2) }
    }
    if (args === 'config') {
      await $.ui.open({ id: CONFIG_PANE_ID, title: S.settingsTitle, focus: true, closeOnEscape: true })
      return { text: S.settingsOpened }
    }
    // Bare /sst: the pane, open or closed.
    if ((await $.ui.panes()).some(p => p.id === PANE_ID)) {
      await $.ui.close({ id: PANE_ID })
      return { text: S.paneClosed }
    }
    await $.ui.open({ id: PANE_ID, title: S.paneTitle })
    return { text: S.paneOpened }
  })
}
