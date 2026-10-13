// The status line under the prompt, where Claude Code draws its hint: the hint kept at the left.
import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { minibarParts } from './minibar-rows'
import { normalizeSettings } from './settings'
import { EMPTY_LIVE, INITIAL_SETTINGS } from './state'
import { S } from './strings'
import type { GitSnapshot, UsageView } from '../types'

const usageAtom = atom({ plugin: 'session-status', key: 'usage' } as const, null as UsageView | null)
const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

/** Columns kept for the gap and the open mark. */
const GUTTER = 6

export const registerMinibar = (on: On): void => {
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // The terminal only: the desktop app shows model and context on its own.
    if (e.surface !== 'terminal') return next(e)
    const hint = e.props.hint
    const columns = e.viewport?.columns ?? 120
    const parts = minibarParts(
      {
        usage: await read($, usageAtom),
        live: await read($, liveAtom),
        git: await read($, gitAtom),
        settings: normalizeSettings(await read($, settingsAtom)),
        now: await $.clock.now(),
      },
      columns - [...hint].length - GUTTER,
    )
    if (parts.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" justifyContent="space-between" paddingX={2}>
        <Text dimColor>{hint}</Text>
        <Box flexDirection="row">
          <Text>
            {parts.map(p => (
              <Text color={p.color} bold={p.bold} dimColor={p.dim}>
                {p.text}
              </Text>
            ))}
          </Text>
          <Text> </Text>
          <Button key="open" label={S.openPane} plain onPress={() => $.ui.open({ id: 'sst', title: S.paneTitle })} />
        </Box>
      </Box>
    )
  })
}
