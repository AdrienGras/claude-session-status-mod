// The status line under the prompt, where Claude Code draws its hint. Beside it (one row), the hint is kept
// at the left as dim text; on a row of its own, the engine's line is kept as it draws it (mode, live pills).
import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { cellWidth } from './cells'
import { minibarLine, minibarRow } from './minibar-rows'
import { PANE_ID } from './pane'
import { normalizeSettings } from './settings'
import { EMPTY_LIVE, INITIAL_SETTINGS } from './state'
import { S } from './strings'
import type { Part } from './parts'
import type { GitSnapshot, UsageView } from '../types'

const usageAtom = atom({ plugin: 'session-status', key: 'usage' } as const, null as UsageView | null)
const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

export const registerMinibar = (on: On): void => {
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // The terminal only: the desktop app shows model and context on its own.
    if (e.surface !== 'terminal') return next(e)
    const columns = e.viewport?.columns ?? 120
    const input = {
      usage: await read($, usageAtom),
      live: await read($, liveAtom),
      git: await read($, gitAtom),
      settings: normalizeSettings(await read($, settingsAtom)),
      now: await $.clock.now(),
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const status = (parts: Part[]) => (
      <Box flexDirection="row">
        <Text>
          {parts.map(p => (
            <Text color={p.color} bold={p.bold} dimColor={p.dim}>
              {p.text}
            </Text>
          ))}
        </Text>
        <Text> </Text>
        <Button key="open" label={S.openPane} plain onPress={() => $.ui.open({ id: PANE_ID, title: S.paneTitle })} />
      </Box>
    )

    if (input.settings.hintLayout === 'below') {
      // The engine draws its own line first, whatever its place in the tree, padded as its own: the status
      // is the row under it, aligned with the hint.
      const engine = await next(e)
      const parts = minibarRow(input, columns)
      if (parts.length === 0) return engine
      return (
        <Box flexDirection="column">
          {engine}
          {status(parts)}
        </Box>
      )
    }

    const hint = e.props.hint
    const parts = minibarLine(input, cellWidth(hint), columns)
    if (parts.length === 0) return next(e)
    return (
      <Box flexDirection="row" justifyContent="space-between" paddingX={2}>
        <Text dimColor>{hint}</Text>
        {status(parts)}
      </Box>
    )
  })
}
